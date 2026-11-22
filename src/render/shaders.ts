// WebGL2 GLSL 着色器源码（ES 3.00）
// 光谱常量经 JS 端 uniform 注入，避免在着色器里硬编码数据表

export const GEOMETRY_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in float aT;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vNormal;
out float vT;
out vec3 vWorldPos;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorldPos = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  vT = aT;
  gl_Position = uViewProj * world;
}`

// 几何通道：输出视图空间法向 z、t 参数，深度写入后供厚度通道反投影
export const GEOMETRY_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in float vT;
in vec3 vWorldPos;
uniform vec3 uCamPos;
out vec4 outColor;
void main() {
  vec3 viewDir = normalize(uCamPos - vWorldPos);
  float facing = dot(normalize(vNormal), viewDir);
  outColor = vec4(facing, vT, 0.0, 1.0);
}`

export const THICKNESS_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in float aT;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat4 uView;
out vec3 vNormal;
out vec3 vViewNormal;
out float vT;
out vec3 vNdc;
out vec3 vWorldPos;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 clip = uViewProj * world;
  vWorldPos = world.xyz;
  vNdc = clip.xyz / clip.w;
  vNormal = mat3(uModel) * aNormal;
  vViewNormal = mat3(uView) * vNormal;
  vT = aT;
  gl_Position = clip;
}`

// 厚度通道：正面渲染时通过深度图找背面，路径长度 / |cosθ| 得几何壁厚
export const THICKNESS_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vViewNormal;
in float vT;
in vec3 vNdc;
in vec3 vWorldPos;
uniform highp sampler2D uBackDepth;
uniform vec2 uDepthRange;
out vec4 outColor;
float linearize(float d) {
  float near = uDepthRange.x;
  float far = uDepthRange.y;
  return near * far / (far - d * (far - near));
}
void main() {
  vec2 uv = vNdc.xy * 0.5 + 0.5;
  float backD = texture(uBackDepth, uv).r;
  float frontD = gl_FragCoord.z;
  float backZ = linearize(backD);
  float frontZ = linearize(frontD);
  float path = max(0.0, backZ - frontZ);
  float cosT = clamp(abs(normalize(vViewNormal).z), 0.18, 1.0);
  float thickness = clamp(path / cosT, 0.0, 4.0);
  outColor = vec4(thickness, vT, 0.0, 1.0);
}`

export const SPECTRAL_VS = THICKNESS_VS

// 全光谱主着色器：KM 3D LUT 叠层 + 次表面背光 + 切端乳光 + 镜面反射
export const SPECTRAL_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vViewNormal;
in float vT;
in vec3 vNdc;
in vec3 vWorldPos;
uniform highp sampler2D uThickness;
uniform highp sampler3D uLutR[11];
uniform highp sampler3D uLutT[11];
uniform vec3 uLutMax;
uniform vec4 uLayerProfile[4]; // xyz: 颈/中/切厚度, w 预留
uniform vec4 uCoreProfile;    // xyz: 颈/中/切内冠厚度
uniform float uSpectrum[41];  // 光源 SPD
uniform vec3 uWhiteXYZ;
uniform float uCoreR[41];
uniform float uBackdrop[41];
uniform vec3 uLightDir;
uniform vec3 uCamPos;
uniform float uMouthDark;
uniform float uOpal;
uniform float uAmbient;
uniform float uExposure;
uniform int uMode;           // 0 颜色 1 Lab 2 dE2000 3 内冠厚度
uniform vec3 uTargetLab;
out vec4 outColor;

vec3 zoneProfile(vec4 p, float t) {
  float f = clamp(t, 0.0, 1.0);
  if (f < 0.5) return mix(vec3(p.x), vec3(p.y), f * 2.0);
  return mix(vec3(p.y), vec3(p.z), (f - 0.5) * 2.0);
}

// CIE 1931 配色函数直接内嵌（41 波段），避免大量 uniform 注入
const vec3 CMF_TABLE[41] = vec3[41](
  vec3(0.001368,0.000039,0.00645), vec3(0.004243,0.00012,0.02005),
  vec3(0.01431,0.000396,0.06785), vec3(0.04351,0.00121,0.2074),
  vec3(0.13438,0.004,0.6456), vec3(0.2839,0.0116,1.3856),
  vec3(0.34828,0.023,1.74706), vec3(0.3362,0.038,1.77211),
  vec3(0.2908,0.06,1.6692), vec3(0.19536,0.09098,1.28764),
  vec3(0.09564,0.13902,0.81295), vec3(0.03201,0.20802,0.46518),
  vec3(0.0049,0.323,0.272), vec3(0.0093,0.503,0.1582),
  vec3(0.06327,0.71,0.07825), vec3(0.1655,0.862,0.04216),
  vec3(0.2904,0.954,0.0203), vec3(0.43345,0.99495,0.00875),
  vec3(0.5945,0.995,0.0039), vec3(0.7621,0.952,0.0021),
  vec3(0.9163,0.87,0.00165), vec3(1.0263,0.757,0.0011),
  vec3(1.0622,0.631,0.0008), vec3(1.0026,0.503,0.00034),
  vec3(0.85445,0.381,0.00019), vec3(0.6424,0.265,0.00005),
  vec3(0.4479,0.175,0.00002), vec3(0.2835,0.107,0.0),
  vec3(0.1649,0.061,0.0), vec3(0.0874,0.032,0.0),
  vec3(0.04677,0.017,0.0), vec3(0.0227,0.00821,0.0),
  vec3(0.011359,0.004102,0.0), vec3(0.00579,0.002091,0.0),
  vec3(0.002899,0.001047,0.0), vec3(0.00144,0.00052,0.0),
  vec3(0.00069,0.000249,0.0), vec3(0.000332,0.00012,0.0),
  vec3(0.000166,0.00006,0.0), vec3(0.000083,0.00003,0.0),
  vec3(0.000042,0.000015,0.0)
);

vec3 spectralToXYZ(float refl[41], float trans[41], vec3 N, vec3 L) {
  vec3 xyz = vec3(0.0);
  float norm = 0.0;
  float wrap = clamp((dot(N, L) + 0.35) / 1.35, 0.0, 1.0);
  for (int i = 0; i < 41; i++) {
    float back = mix(uBackdrop[i], 0.0, uMouthDark);
    // 背光透射：次表面散射，暗口腔时后向光骤减
    float sss = trans[i] * back * (0.6 + 0.8 * (1.0 - abs(dot(N, L))));
    float lit = uSpectrum[i] * (uAmbient + wrap * (1.0 - uAmbient));
    float r = refl[i] * lit + sss;
    xyz += CMF_TABLE[i] * r;
    norm += uSpectrum[i] * CMF_TABLE[i].y;
  }
  return xyz * (100.0 / norm);
}

vec3 xyzToLab(vec3 xyz) {
  vec3 rel = xyz / uWhiteXYZ / 100.0;
  vec3 f;
  float d = 216.0 / 24389.0;
  f.x = rel.x > d ? cbrt(rel.x) : (841.0/108.0) * rel.x + 16.0/116.0;
  f.y = rel.y > d ? cbrt(rel.y) : (841.0/108.0) * rel.y + 16.0/116.0;
  f.z = rel.z > d ? cbrt(rel.z) : (841.0/108.0) * rel.z + 16.0/116.0;
  return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z));
}

vec3 labToXyz(vec3 lab) {
  float fy = (lab.x + 16.0) / 116.0;
  float fx = fy + lab.y / 500.0;
  float fz = fy - lab.z / 200.0;
  float d3 = 6.0 / 29.0;
  vec3 f = vec3(fx, fy, fz);
  vec3 t = vec3(
    fx > d3 ? fx*fx*fx : 3.0*d3*d3*(fx-16.0/116.0),
    fy > d3 ? fy*fy*fy : 3.0*d3*d3*(fy-16.0/116.0),
    fz > d3 ? fz*fz*fz : 3.0*d3*d3*(fz-16.0/116.0)
  );
  return uWhiteXYZ * t;
}

float ciede2000(vec3 lab1, vec3 lab2) {
  float C1 = length(lab1.yz);
  float C2 = length(lab2.yz);
  float avgC = (C1 + C2) / 2.0;
  float G = 0.5 * (1.0 - sqrt(pow(avgC,7.0) / (pow(avgC,7.0) + 6103515625.0)));
  float a1p = (1.0 + G) * lab1.y;
  float a2p = (1.0 + G) * lab2.y;
  float C1p = length(vec2(a1p, lab1.z));
  float C2p = length(vec2(a2p, lab2.z));
  float avgCp = (C1p + C2p) / 2.0;
  float h1p = C1p == 0.0 ? 0.0 : degrees(atan(lab1.z, a1p));
  float h2p = C2p == 0.0 ? h1p : degrees(atan(lab2.z, a2p));
  if (h1p < 0.0) h1p += 360.0;
  if (h2p < 0.0) h2p += 360.0;
  float avgh;
  if (C1p == 0.0 && C2p == 0.0) avgh = h1p + h2p;
  else if (abs(h1p - h2p) <= 180.0) avgh = (h1p + h2p) / 2.0;
  else avgh = (h1p + h2p + (h1p + h2p < 360.0 ? 360.0 : -360.0)) / 2.0;
  float T = 1.0 - 0.17*cos(radians(avgh-30.0)) + 0.24*cos(radians(2.0*avgh))
    + 0.32*cos(radians(3.0*avgh+6.0)) - 0.2*cos(radians(4.0*avgh-63.0));
  float dhp;
  if (C1p == 0.0 || C2p == 0.0) dhp = 0.0;
  else if (abs(h2p-h1p) <= 180.0) dhp = h2p - h1p;
  else dhp = h2p - h1p + (h2p > h1p ? -360.0 : 360.0);
  float dLp = lab2.x - lab1.x;
  float dCp = C2p - C1p;
  float dHp = 2.0 * sqrt(C1p*C2p) * sin(radians(dhp / 2.0));
  float avgL = (lab1.x + lab2.x) / 2.0;
  float Sl = 1.0 + 0.015 * pow(avgL-50.0, 2.0) / sqrt(20.0 + pow(avgL-50.0, 2.0));
  float Sc = 1.0 + 0.045 * avgCp;
  float Sh = 1.0 + 0.015 * avgCp * T;
  float dTheta = 30.0 * exp(-pow((avgh-275.0)/25.0, 2.0));
  float Rc = 2.0 * sqrt(pow(avgCp,7.0) / (pow(avgCp,7.0) + 6103515625.0));
  float Rt = -sin(radians(2.0*dTheta)) * Rc;
  float lT = dLp / Sl;
  float cT = dCp / Sc;
  float hT = dHp / Sh;
  return sqrt(lT*lT + cT*cT + hT*hT + Rt*cT*hT);
}

vec3 srgbEncode(vec3 c) {
  vec3 v = clamp(c, 0.0, 1.0);
  return mix(12.92 * v, 1.055 * pow(v, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), v));
}

void main() {
  vec2 uv = vNdc.xy * 0.5 + 0.5;
  vec4 thickSample = texture(uThickness, uv);
  float geomThick = thickSample.x;
  float t = thickSample.y;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);

  // 各层物理厚度：剖面分区曲线按 t 插值，受总壁厚约束
  vec3 dDentin = zoneProfile(uLayerProfile[0], t);
  vec3 dEnamel = zoneProfile(uLayerProfile[1], t);
  vec3 dTransp = zoneProfile(uLayerProfile[2], t);
  vec3 dEffectV = zoneProfile(uLayerProfile[3], t);
  vec3 dCore = zoneProfile(uCoreProfile, t);
  float budget = max(0.2, geomThick - dCore.x);
  float total = dDentin.x + dEnamel.x + dTransp.x + dEffectV.x;
  float fit = min(1.0, budget / max(total, 0.001));
  float td = dDentin.x * fit;
  float te = dEnamel.x * fit;
  float tt = dTransp.x * fit;
  float fe = dEffectV.x * fit;

  if (uMode == 3) {
    // 内冠厚度可视化：蓝(薄)->绿->红(厚)
    float v = clamp(dCore.x / 1.0, 0.0, 1.0);
    vec3 heat = mix(vec3(0.15,0.4,0.95), vec3(0.2,0.85,0.4), smoothstep(0.0,0.5,v));
    heat = mix(heat, vec3(0.95,0.3,0.2), smoothstep(0.5,1.0,v));
    outColor = vec4(heat, 1.0);
    return;
  }

  // 效果瓷厚度折入切端轴
  float enamelAxis = te + fe;
  vec3 coord = vec3(
    clamp(td / uLutMax.x, 0.0, 1.0),
    clamp(enamelAxis / uLutMax.y, 0.0, 1.0),
    clamp(tt / uLutMax.z, 0.0, 1.0)
  );
  float refl[41];
  float trans[41];
  // 每 4 个波段打包在一个 RGBA 3D 纹理层中，共 11 层（最后一层仅 1 个有效波段）
  for (int q = 0; q < 11; q++) {
    vec4 rv = texture(uLutR[q], coord);
    vec4 tv = texture(uLutT[q], coord);
    for (int c = 0; c < 4; c++) {
      int idx = q * 4 + c;
      if (idx >= 41) break;
      float rval;
      float tval;
      if (c == 0) { rval = rv.r; tval = tv.r; }
      else if (c == 1) { rval = rv.g; tval = tv.g; }
      else if (c == 2) { rval = rv.b; tval = tv.b; }
      else { rval = rv.a; tval = tv.a; }
      refl[idx] = rval;
      trans[idx] = tval;
    }
  }
  // 基底反射：Rb(黑底)与 Rg 合成 R=(c+dRg)/(a+bRg)，由 Rb=-c/a、T=1/a 推导为
  // R = Rb + T²Rg / (1 - Rb*Rg)
  for (int i = 0; i < 41; i++) {
    float rg = uCoreR[i];
    float rb = refl[i];
    float tr = trans[i];
    refl[i] = clamp(rb + (tr * tr * rg) / max(0.001, 1.0 - rb * rg), 0.0, 0.99);
  }

  // 切端乳光：瑞利散射给切端加蓝、减红，随 t 增强
  float opalMask = smoothstep(0.55, 1.0, t) * uOpal;
  for (int i = 0; i < 41; i++) {
    float wl = 380.0 + float(i) * 10.0;
    float ray = pow(550.0 / wl, 4.0);
    refl[i] = clamp(refl[i] + opalMask * 0.10 * (ray - 1.0) * 0.4, 0.0, 0.99);
  }

  vec3 L = normalize(uLightDir);
  vec3 xyz = spectralToXYZ(refl, trans, N, L);

  // 釉质镜面反射（菲涅尔 + Blinn），无色 achromatic
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  float spec = fres * pow(ndh, 90.0) * 0.65;
  vec3 specXYZ = vec3(1.0, 1.0, 1.0) * spec * 100.0;
  xyz = (xyz + specXYZ) * uExposure;

  vec3 lab = xyzToLab(clamp(xyz, 0.0, 120.0));
  if (uMode == 1) {
    // Lab 分量归一化伪彩：L 亮度、a 红绿、b 黄蓝
    outColor = vec4(srgbEncode(vec3(lab.x / 100.0, (lab.y + 40.0) / 80.0, (lab.z + 40.0) / 80.0)), 1.0);
    return;
  }
  if (uMode == 2) {
    float de = ciede2000(lab, uTargetLab);
    // 色差热力：绿(<1) -> 黄(2) -> 红(>4)
    vec3 heat = mix(vec3(0.2,0.8,0.35), vec3(0.98,0.8,0.2), smoothstep(0.5, 2.0, de));
    heat = mix(heat, vec3(0.92,0.2,0.15), smoothstep(2.0, 4.5, de));
    outColor = vec4(heat, 1.0);
    return;
  }

  vec3 lin = xyz / 100.0;
  // XYZ -> 线性 sRGB
  mat3 toRgb = mat3(
    3.2406, -0.9689, 0.0557,
    -1.5372, 1.8758, -0.2040,
    -0.4986, 0.0415, 1.0570
  );
  vec3 rgb = toRgb * lin;
  outColor = vec4(srgbEncode(rgb), 1.0);
}`
