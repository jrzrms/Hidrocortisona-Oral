import { GoogleGenAI } from "@google/genai";

// Model Selection
export enum PKModelType {
  WERUMEUS_BUNING_2017 = "Werumeus (ADULTOS)",
  MICHELET_2020 = "Michelet_EJE",
  MICHELET_2023 = "Michelet_Frontiers",
  MELIN_2020 = "Melin",
  CLINICAL_ADJUSTED = "Clínico (Ajustado)",
  CUSTOM_FIT = "Ajuste Personalizado"
}

export enum CortisolType {
  TOTAL = "Total",
  FREE = "Libre"
}

export interface WerumeusParams {
  ka: number;
  clTotal: number;
  vdTotal: number;
  clFree: number;
  vdFree: number;
  f?: number;
}

export interface MicheletParams {
  vmaxAbs: number;
  kmAbs: number;
  cl: number;
  vc: number;
  q: number;
  vp: number;
  base: number;
}

export interface MelinParams {
  ka: number;
  cl: number;
  vc: number;
  f: number;
  base: number;
}

export interface PKParams {
  werumeus: WerumeusParams;
  michelet: MicheletParams;
  micheletV2: MicheletParams;
  melin: MelinParams;
  clinical: WerumeusParams; // Uses same structure as Werumeus
  customFit: WerumeusParams;
}

export const DEFAULT_PK_PARAMS: PKParams = {
  werumeus: {
    ka: 1.4,
    clTotal: 14.04,
    vdTotal: 41.75,
    clFree: 244.13,
    vdFree: 452.62,
    f: 0.96
  },
  michelet: {
    vmaxAbs: 21600,
    kmAbs: 4810,
    cl: 409,
    vc: 10.6,
    q: 160,
    vp: 124,
    base: 0
  },
  micheletV2: {
    vmaxAbs: 21600,
    kmAbs: 4810,
    cl: 409,
    vc: 10.6,
    q: 160,
    vp: 124,
    base: 0
  },
  melin: {
    ka: 1.12,
    cl: 22.4,
    vc: 39.3,
    f: 0.826,
    base: 0
  },
  clinical: {
    ka: 1.80,
    clTotal: 17.6,
    vdTotal: 32.0,
    clFree: 17.6 * 15.8, // Adjusted based on binding ratio for consistency
    vdFree: 32.0 * 15.8,
    f: 0.826
  },
  customFit: {
    ka: 1.80,
    clTotal: 17.6,
    vdTotal: 32.0,
    clFree: 17.6 * 15.8,
    vdFree: 32.0 * 15.8,
    f: 0.826
  }
};

// Pharmacokinetic Model Constants
export const F_BIO = 0.96;   // Default Bioavailability
export const C_BASAL = 0;    // nmol/L (Basal concentration - adjusted based on snippet)
export const CONVERSION_FACTOR = 1000000 / 362.46; // mg to nmol (2758.92)

export interface Pulse {
  time: number; // minutes from simulation start (10:40 AM)
  dose: number; // mg
}

export const STANDARD_PULSES: Pulse[] = [
  { time: 680, dose: 2.3 },    // 11:20 AM
  { time: 1080, dose: 1.7 },   // 18:00 PM
  { time: 1400, dose: 3.5 },   // 23:20 PM
  { time: 360, dose: 4.2 },    // 06:00 AM
];

export interface SimulationPoint {
  time: number; // minutes
  concentration: number; // nmol/L
  patientValue?: number; // nmol/L (optional patient measurement)
}

export const PATIENT_MEASUREMENTS = [
  { time: 640, val: 45.98 },   // 10:40
  { time: 680, val: 21.69 },   // 11:20
  { time: 800, val: 384.38 },  // 13:20
  { time: 840, val: 266.59 },  // 14:00
  { time: 920, val: 142.88 },  // 15:20
  { time: 960, val: 84.19 },   // 16:00
  { time: 1000, val: 39.49 },  // 16:40
  { time: 1040, val: 22.09 },  // 17:20
  { time: 1080, val: 27.0 },   // 18:00
  { time: 1160, val: 314.84 }, // 19:20
  { time: 1200, val: 232.87 }, // 20:00
  { time: 1240, val: 151.43 }, // 20:40
  { time: 1280, val: 91.92 },  // 21:20
  { time: 1320, val: 60.54 },  // 22:00
  { time: 1400, val: 43.04 },  // 23:20
  { time: 40, val: 311.99 },   // 00:40
  { time: 80, val: 488.5 },    // 01:20
  { time: 160, val: 309.61 },  // 02:40
  { time: 240, val: 211.76 },  // 04:00
  { time: 280, val: 117.21 },  // 04:40
  { time: 360, val: 51.66 },   // 06:00
  { time: 400, val: 529.19 },  // 06:40
  { time: 440, val: 319.15 },  // 07:20
  { time: 520, val: 186.99 },  // 08:40
  { time: 560, val: 92.28 },   // 09:20
  { time: 640, val: 45.98 },   // 10:40 (End)
];

/**
 * Calculates total cortisol from free cortisol using simplified protein binding equilibrium.
 */
export function calculateTotalCortisol(cFree: number, _cbg_ugml: number = 29.0, _ageYears?: number): number {
  const Kd_CBG = 30; // nmol/L
  const Bmax_CBG = 400; // nmol/L 
  const NS_Alb = 1.5;
  
  const conc_total = cFree + (NS_Alb * cFree) + ((Bmax_CBG * cFree) / (Kd_CBG + cFree));
  return conc_total;
}

/**
 * Simulates cortisol concentration using the selected model.
 */
export function simulate(
  weight: number,
  pulses: Pulse[],
  modelType: PKModelType = PKModelType.WERUMEUS_BUNING_2017,
  ageDays: number = 3650, // Default 10 years
  cortisolType: CortisolType = CortisolType.TOTAL,
  params: PKParams = DEFAULT_PK_PARAMS,
  durationMinutes: number = 1440,
  startTimeMinutes: number = 0
): SimulationPoint[] {
  let sim: SimulationPoint[] = [];
  if (modelType === PKModelType.MICHELET_2020) {
    sim = simulateMichelet(weight, ageDays, pulses, cortisolType, params.michelet, durationMinutes, startTimeMinutes);
  } else if (modelType === PKModelType.MICHELET_2023) {
    sim = simulateMicheletV2(weight, ageDays, pulses, cortisolType, params.micheletV2, durationMinutes, startTimeMinutes);
  } else if (modelType === PKModelType.MELIN_2020) {
    sim = simulateMelin(weight, pulses, cortisolType, params.melin, durationMinutes, startTimeMinutes);
  } else if (modelType === PKModelType.CLINICAL_ADJUSTED) {
    sim = simulateWerumeus(weight, pulses, cortisolType, params.clinical, durationMinutes, startTimeMinutes);
  } else if (modelType === PKModelType.CUSTOM_FIT) {
    sim = simulateWerumeus(weight, pulses, cortisolType, params.customFit, durationMinutes, startTimeMinutes);
  } else {
    sim = simulateWerumeus(weight, pulses, cortisolType, params.werumeus, durationMinutes, startTimeMinutes);
  }

  return sim.map(p => ({
    ...p,
    concentration: isNaN(p.concentration) || !isFinite(p.concentration) ? 0 : Math.max(0, p.concentration)
  }));
}

/**
 * Melin et al. (2020) - One compartment model with allometric scaling
 */
function simulateMelin(
  weight: number,
  pulses: Pulse[],
  cortisolType: CortisolType = CortisolType.TOTAL,
  params: MelinParams,
  durationMinutes: number = 1440,
  startTimeMinutes: number = 0
): SimulationPoint[] {
  const results: SimulationPoint[] = [];
  
  // Allometric scaling (Reference 70kg)
  const weightFactor = weight / 70;
  
  const cl = params.cl * Math.pow(weightFactor, 0.75);
  const vd = params.vc * weightFactor;
  const ke = cl / vd;
  const ka = params.ka;
  const f = params.f;

  // Bateman function for a single dose (returns nmol/L)
  const calcBateman = (D: number, tHours: number) => {
    if (tHours <= 0) return 0;
    const factor = (D * f * ka) / (vd * (ka - ke));
    const concMgL = factor * (Math.exp(-ke * tHours) - Math.exp(-ka * tHours));
    return concMgL * CONVERSION_FACTOR;
  };

  for (let t_offset = 0; t_offset <= durationMinutes; t_offset++) {
    const t_current_abs = startTimeMinutes + t_offset;
    let totalConcentration = 0;

    for (const pulse of pulses) {
      let timeElapsedMin = (t_current_abs - pulse.time);
      while (timeElapsedMin < 0) timeElapsedMin += 1440;

      totalConcentration += calcBateman(pulse.dose, timeElapsedMin / 60);
      totalConcentration += calcBateman(pulse.dose, (timeElapsedMin + 1440) / 60);
    }

    // Melin (2020) simulates Free and Total binding similarly to Michelet if requested,
    // but the paper focus is on total. We apply the same binding if 'TOTAL' is selected
    // and assume the simulated value was free, or just use the baseline if it's already total.
    // The paper Table 2 Baselinecort is 26.5 nmol/L (Total).
    
    let finalConcentration = totalConcentration + params.base;
    
    // If user wants FREE Cortisol but model describes TOTAL, we could theoretically invert,
    // but Melin parameters are for TOTAL. For consistency with interface:
    if (cortisolType === CortisolType.FREE) {
        // Melin baseline is total. This is a simplification.
        finalConcentration *= 0.1; // Rough estimate if not using full equilibrium
    }

    results.push({
      time: t_current_abs,
      concentration: finalConcentration
    });
  }

  return results;
}

/**
 * Werumeus Buning et al. (2017) - One compartment model
 */
function simulateWerumeus(
  weight: number,
  pulses: Pulse[],
  cortisolType: CortisolType = CortisolType.TOTAL,
  params: WerumeusParams,
  durationMinutes: number = 1440,
  startTimeMinutes: number = 0
): SimulationPoint[] {
  const results: SimulationPoint[] = [];
  
  // Weight-based scaling (linear for Vd and CL in this adult model context)
  const weightFactor = weight / 70;
  
  // Apply scaling as in Python snippet (for volumes) and generic for CL
  const vd_total = params.vdTotal * weightFactor;
  const vd_free = params.vdFree * weightFactor;
  const cl_total = params.clTotal * Math.pow(weightFactor, 0.75); // snippet didn't scale but we should for population use
  const cl_free = params.clFree * Math.pow(weightFactor, 0.75);
  
  const vd = (cortisolType === CortisolType.TOTAL ? vd_total : vd_free);
  const cl = (cortisolType === CortisolType.TOTAL ? cl_total : cl_free);
  const ke = cl / vd;
  const ka = params.ka;
  const f_bio = params.f || F_BIO;

  // Bateman function for a single dose (returns nmol/L)
  const calcBateman = (D: number, tHours: number) => {
    if (tHours <= 0) return 0;
    const factor = (D * f_bio * ka) / (vd * (ka - ke));
    const concMgL = factor * (Math.exp(-ke * tHours) - Math.exp(-ka * tHours));
    return concMgL * CONVERSION_FACTOR;
  };

  for (let t_offset = 0; t_offset <= durationMinutes; t_offset++) {
    const t_current_abs = startTimeMinutes + t_offset;
    let totalConcentration = 0;

    for (const pulse of pulses) {
      let timeElapsedMin = (t_current_abs - pulse.time);
      while (timeElapsedMin < 0) timeElapsedMin += 1440;

      totalConcentration += calcBateman(pulse.dose, timeElapsedMin / 60);
      totalConcentration += calcBateman(pulse.dose, (timeElapsedMin + 1440) / 60);
    }

    results.push({
      time: t_current_abs,
      concentration: totalConcentration + C_BASAL
    });
  }

  return results;
}

/**
 * Michelet et al. (2023) - V2 with simplified maturation logic
 */
function simulateMicheletV2(
  weight: number,
  ageDays: number,
  pulses: Pulse[],
  cortisolType: CortisolType = CortisolType.TOTAL,
  params: MicheletParams,
  durationMinutes: number = 1440,
  startTimeMinutes: number = 0
): SimulationPoint[] {
  const results: SimulationPoint[] = [];
  const ageYears = ageDays / 365.25;

  // Maturation factor based on Python snippet for Frontiers model
  const factor_maduracion = 0.4 + 0.6 * (1 - Math.exp(-0.5 * ageYears));
  const clRatio = factor_maduracion;

  // Scaling (Reference 70kg)
  const weightFactor = weight / 70;
  const VMAX_ABS = params.vmaxAbs; // nmol/h
  const KM_ABS = params.kmAbs;    // nmol
  
  // Scaling volumes and clearance
  const escala_vol = weightFactor;
  const escala_cl = Math.pow(weightFactor, 0.75);

  const VC = params.vc * escala_vol;
  const VP = params.vp * escala_vol;
  const Q = params.q; // L/h
  const CL = params.cl * escala_cl * clRatio;

  // State variables (nmol)
  let A_depot = 0;
  let A_c = 0;
  let A_p = 0;

  const dt = 1/60; // 1 minute step in hours
  const subSteps = 6;
  const subDt = dt / subSteps;
  const totalMinutes = 1440 * 2; 

  const allPulses = [
    ...pulses.map(p => ({ ...p, time: p.time })),
    ...pulses.map(p => ({ ...p, time: p.time + 1440 }))
  ];

  for (let step = 0; step <= totalMinutes; step++) {
    const currentPulses = allPulses.filter(p => p.time === step);
    for (const p of currentPulses) {
      A_depot += p.dose * CONVERSION_FACTOR;
    }

    for (let s = 0; s < subSteps; s++) {
      const rate_abs = (VMAX_ABS * A_depot) / (KM_ABS + A_depot);
      const dA_c = rate_abs - (CL / VC) * A_c - (Q / VC) * A_c + (Q / VP) * A_p;
      const dA_p = (Q / VC) * A_c - (Q / VP) * A_p;

      A_depot -= rate_abs * subDt;
      A_c += dA_c * subDt;
      A_p += dA_p * subDt;
      
      A_depot = Math.max(0, A_depot);
      A_c = Math.max(0, A_c);
      A_p = Math.max(0, A_p);
    }

    if (step >= 1440) {
      const cFree = (A_c / VC);
      const concentration = cortisolType === CortisolType.TOTAL 
        ? calculateTotalCortisol(cFree) 
        : cFree;

      results.push({
        time: (step - 1440 + startTimeMinutes) % 1440,
        concentration: concentration
      });
    }
  }

  return results.sort((a, b) => a.time - b.time);
}

/**
 * Michelet et al. (2020) - EJE model (Maturation = 1.0)
 */
function simulateMichelet(
  weight: number,
  _ageDays: number,
  pulses: Pulse[],
  cortisolType: CortisolType = CortisolType.TOTAL,
  params: MicheletParams,
  durationMinutes: number = 1440,
  startTimeMinutes: number = 0
): SimulationPoint[] {
  const results: SimulationPoint[] = [];

  // Scaling (Reference 70kg)
  const weightFactor = weight / 70;
  const VMAX_ABS = params.vmaxAbs; // nmol/h
  const KM_ABS = params.kmAbs;    // nmol
  
  const escala_vol = weightFactor;
  const escala_cl = Math.pow(weightFactor, 0.75);

  const VC = params.vc * escala_vol;
  const VP = params.vp * escala_vol;
  const Q = params.q; // L/h
  const CL = params.cl * escala_cl; // factor_maduracion = 1.0

  // State variables (nmol)
  let A_depot = 0;
  let A_c = 0;
  let A_p = 0;

  const dt = 1/60; 
  const subSteps = 6;
  const subDt = dt / subSteps;
  const totalMinutes = 1440 * 2; 

  const allPulses = [
    ...pulses.map(p => ({ ...p, time: p.time })),
    ...pulses.map(p => ({ ...p, time: p.time + 1440 }))
  ];

  for (let step = 0; step <= totalMinutes; step++) {
    const currentPulses = allPulses.filter(p => p.time === step);
    for (const p of currentPulses) {
      A_depot += p.dose * CONVERSION_FACTOR;
    }

    for (let s = 0; s < subSteps; s++) {
      const rate_abs = (VMAX_ABS * A_depot) / (KM_ABS + A_depot);
      const dA_c = rate_abs - (CL / VC) * A_c - (Q / VC) * A_c + (Q / VP) * A_p;
      const dA_p = (Q / VC) * A_c - (Q / VP) * A_p;

      A_depot -= rate_abs * subDt;
      A_c += dA_c * subDt;
      A_p += dA_p * subDt;
      
      A_depot = Math.max(0, A_depot);
      A_c = Math.max(0, A_c);
      A_p = Math.max(0, A_p);
    }

    if (step >= 1440) {
      const cFree = (A_c / VC);
      const concentration = cortisolType === CortisolType.TOTAL 
        ? calculateTotalCortisol(cFree) 
        : cFree;

      results.push({
        time: (step - 1440 + startTimeMinutes) % 1440,
        concentration: concentration
      });
    }
  }

  return results.sort((a, b) => a.time - b.time);
}

export const PHYSIOLOGICAL_TARGET = [
  { time: 0, val: 85 },     // 00:00
  { time: 40, val: 140 },   // 00:40
  { time: 80, val: 190 },   // 01:20
  { time: 120, val: 250 },  // 02:00
  { time: 160, val: 270 },  // 02:40
  { time: 200, val: 250 },  // 03:20
  { time: 240, val: 390 },  // 04:00
  { time: 280, val: 430 },  // 04:40
  { time: 320, val: 520 },  // 05:20
  { time: 360, val: 510 },  // 06:00
  { time: 400, val: 570 },  // 06:40
  { time: 440, val: 550 },  // 07:20
  { time: 480, val: 590 },  // 08:00 (Peak)
  { time: 520, val: 490 },  // 08:40
  { time: 560, val: 430 },  // 09:20
  { time: 600, val: 370 },  // 10:00
  { time: 640, val: 275 },  // 10:40
  { time: 680, val: 250 },  // 11:20
  { time: 720, val: 305 },  // 12:00
  { time: 760, val: 240 },  // 12:40
  { time: 800, val: 325 },  // 13:20
  { time: 840, val: 285 },  // 14:00
  { time: 880, val: 260 },  // 14:40
  { time: 920, val: 230 },  // 15:20
  { time: 960, val: 230 },  // 16:00
  { time: 1000, val: 245 }, // 16:40
  { time: 1040, val: 235 }, // 17:20
  { time: 1080, val: 245 }, // 18:00
  { time: 1120, val: 165 }, // 18:40
  { time: 1160, val: 175 }, // 19:20
  { time: 1200, val: 160 }, // 20:00
  { time: 1240, val: 200 }, // 20:40
  { time: 1280, val: 165 }, // 21:20
  { time: 1320, val: 150 }, // 22:00
  { time: 1360, val: 130 }, // 22:40
  { time: 1400, val: 115 }, // 23:20
  { time: 1440, val: 85 },  // 24:00
];

/**
 * Interpolates target value for any given minute.
 */
export function getTargetAt(minutes: number): number {
  const m = minutes % 1440;
  const sorted = [...PHYSIOLOGICAL_TARGET].sort((a, b) => a.time - b.time);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (m >= sorted[i].time && m <= sorted[i+1].time) {
      const t = (m - sorted[i].time) / (sorted[i+1].time - sorted[i].time);
      return sorted[i].val + t * (sorted[i+1].val - sorted[i].val);
    }
  }
  return sorted[0].val;
}

/**
 * Calculates the Sum of Squared Errors (SSE) between simulation and target.
 */
export function calculateSSE(sim: SimulationPoint[]): number {
  let sse = 0;
  const step = 15; // More granular check
  for (let t = 0; t < 1440; t += step) {
    const point = sim.find(p => p.time === t);
    if (point) {
      sse += Math.pow(point.concentration - getTargetAt(point.time), 2);
    }
  }
  return sse;
}

/**
 * Calculates the Root Mean Squared Error between simulation and target.
 */
export function calculateError(sim: SimulationPoint[]): number {
  let error = 0;
  const step = 15;
  let count = 0;
  for (let t = 0; t < 1440; t += step) {
    const point = sim.find(p => p.time === t);
    if (point) {
      error += Math.pow(point.concentration - getTargetAt(point.time), 2);
      count++;
    }
  }
  return count > 0 ? Math.sqrt(error / count) : 0;
}

/**
 * Advanced optimizer for doses and timing.
 * Can add up to 6 doses to minimize error.
 */
export function optimizeDoses(
  weight: number,
  initialPulses: Pulse[], 
  modelType: PKModelType = PKModelType.WERUMEUS_BUNING_2017,
  ageDays: number = 3650,
  cortisolType: CortisolType = CortisolType.TOTAL,
  params: PKParams = DEFAULT_PK_PARAMS
): Pulse[] {
  // Start with current pulses
  let currentPulses: Pulse[] = JSON.parse(JSON.stringify(initialPulses));
  
  // If we have fewer than 6, we can add some at strategic points to find a better fit
  if (currentPulses.length < 6) {
    const defaultTimes = [0, 240, 480, 720, 960, 1200];
    for (const t of defaultTimes) {
      if (!currentPulses.find(p => Math.abs(p.time - t) < 60)) {
        currentPulses.push({ time: t, dose: 0 });
        if (currentPulses.length >= 6) break;
      }
    }
  }
  
  // Limit to 6 if somehow more
  if (currentPulses.length > 6) {
    currentPulses.sort((a, b) => b.dose - a.dose);
    currentPulses = currentPulses.slice(0, 6);
  }

  let currentError = calculateError(simulate(weight, currentPulses, modelType, ageDays, cortisolType, params, 1440, 0));
  
  const iterations = 60;
  
  for (let i = 0; i < iterations; i++) {
    let improved = false;
    
    // Shuffle indices to avoid positional bias
    const indices = Array.from({ length: currentPulses.length }, (_, idx) => idx);
    indices.sort(() => Math.random() - 0.5);

    for (const j of indices) {
      const originalPulse = { ...currentPulses[j] };
      
      // 1. Try Dose adjustments
      const doseSteps = [1.0, -1.0, 0.5, -0.5, 0.1, -0.1];
      for (const step of doseSteps) {
        const nextDose = Math.max(0, Math.round((currentPulses[j].dose + step) * 10) / 10);
        if (nextDose === currentPulses[j].dose) continue;
        
        currentPulses[j].dose = nextDose;
        const newError = calculateError(simulate(weight, currentPulses, modelType, ageDays, cortisolType, params, 1440, 0));
        if (newError < currentError) {
          currentError = newError;
          improved = true;
          break; 
        } else {
          currentPulses[j].dose = originalPulse.dose;
        }
      }
      
      // 2. Try Time adjustments
      const timeSteps = [60, -60, 30, -30, 15, -15];
      for (const step of timeSteps) {
        const nextTime = (currentPulses[j].time + step + 1440) % 1440;
        
        currentPulses[j].time = nextTime;
        const newError = calculateError(simulate(weight, currentPulses, modelType, ageDays, cortisolType, params, 1440, 0));
        if (newError < currentError) {
          currentError = newError;
          improved = true;
          break;
        } else {
          currentPulses[j].time = originalPulse.time;
        }
      }
    }
    
    if (!improved) break;
  }
  
  // Return cleaned up pulses (no zero doses, sorted by time)
  return currentPulses
    .filter(p => p.dose > 0.05)
    .sort((a, b) => a.time - b.time);
}

/**
 * Optimizes PK parameters (ka, clTotal, vdTotal) of a 1-compartment model
 * to fit user-provided concentration measurements.
 */
export function fitModelToMeasurements(
  weight: number,
  ageDays: number,
  pulses: Pulse[],
  cortisolType: CortisolType,
  measurements: { time: number; val: number }[]
): { ka: number; clTotal: number; vdTotal: number; clFree: number; vdFree: number; f: number } {
  // Safe initial guesses (70kg standard parameters)
  let bestKa = 1.80;
  let bestCL = 17.6;
  let bestVd = 32.0;
  let bestF = 0.826;
  
  if (!measurements || measurements.length === 0) {
    return { 
      ka: bestKa, 
      clTotal: bestCL, 
      vdTotal: bestVd, 
      clFree: bestCL * 15.8, 
      vdFree: bestVd * 15.8, 
      f: bestF 
    };
  }

  // Objective function: Sum of Squared Errors (SSE)
  function evaluateScore(ka: number, cl: number, vd: number): number {
    const tempParams: PKParams = {
      werumeus: { ka: 1.4, clTotal: 14.04, vdTotal: 41.75, clFree: 244.13, vdFree: 452.62 },
      michelet: { vmaxAbs: 21600, kmAbs: 4810, cl: 409, vc: 10.6, q: 160, vp: 124, base: 0 },
      micheletV2: { vmaxAbs: 21600, kmAbs: 4810, cl: 409, vc: 10.6, q: 160, vp: 124, base: 0 },
      melin: { ka: 1.12, cl: 22.4, vc: 39.3, f: 0.826, base: 0 },
      clinical: { ka: 1.80, clTotal: 17.6, vdTotal: 32.0, clFree: 17.6 * 15.8, vdFree: 32.0 * 15.8, f: 0.826 },
      customFit: { ka, clTotal: cl, vdTotal: vd, clFree: cl * 15.8, vdFree: vd * 15.8, f: bestF }
    };

    const sim = simulate(weight, pulses, PKModelType.CUSTOM_FIT, ageDays, cortisolType, tempParams, 1440, 0);
    
    let sse = 0;
    for (const m of measurements) {
      // Find point in simulation nearest to this measurement's minute
      const match = sim.find(p => p.time === m.time);
      if (match) {
        sse += Math.pow(match.concentration - m.val, 2);
      } else {
        // Fallback: search for closest point
        let closest = sim[0];
        let minDist = 1441;
        for (const p of sim) {
          const dist = Math.min(Math.abs(p.time - m.time), 1440 - Math.abs(p.time - m.time));
          if (dist < minDist) {
            minDist = dist;
            closest = p;
          }
        }
        if (closest) {
          sse += Math.pow(closest.concentration - m.val, 2);
        }
      }
    }
    return sse;
  }

  let bestScore = evaluateScore(bestKa, bestCL, bestVd);

  // Pattern search / Random mutation with local decay (800 steps, very fast in JS)
  let searchRangeKa = 1.5;
  let searchRangeCL = 15.0;
  let searchRangeVd = 25.0;

  for (let step = 0; step < 800; step++) {
    const shrink = Math.pow(1 - step / 800, 1.8);
    
    const candidateKa = Math.max(0.3, Math.min(6.0, bestKa + (Math.random() - 0.5) * searchRangeKa * shrink));
    const candidateCL = Math.max(2.0, Math.min(75.0, bestCL + (Math.random() - 0.5) * searchRangeCL * shrink));
    const candidateVd = Math.max(5.0, Math.min(150.0, bestVd + (Math.random() - 0.5) * searchRangeVd * shrink));

    const score = evaluateScore(candidateKa, candidateCL, candidateVd);

    if (score < bestScore) {
      bestScore = score;
      bestKa = candidateKa;
      bestCL = candidateCL;
      bestVd = candidateVd;
    }
  }

  return {
    ka: Math.round(bestKa * 100) / 100,
    clTotal: Math.round(bestCL * 10) / 10,
    vdTotal: Math.round(bestVd * 10) / 10,
    clFree: Math.round(bestCL * 15.8 * 10) / 10,
    vdFree: Math.round(bestVd * 15.8 * 10) / 10,
    f: bestF
  };
}
