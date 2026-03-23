import { GoogleGenAI } from "@google/genai";

// Pharmacokinetic Model Constants (Werumeus Buning et al., 2017)
export const KA = 1.4;      // h^-1 (Absorption rate constant)
export const CL_STD = 12.85; // L/h (Clearance for 70kg)
export const V_STD = 39.82;  // L (Volume of distribution for 70kg)
export const F_BIO = 0.96;   // Bioavailability (96%)
export const C_BASAL = 15;   // nmol/L (Basal concentration)
export const CONVERSION_FACTOR = 2760; // mg/L to nmol/L

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
 * Simulates cortisol concentration using the Bateman equation and superposition.
 * Based on Werumeus Buning et al. (2017) parameters.
 */
export function simulate(
  weight: number,
  pulses: Pulse[],
  durationMinutes: number = 1440,
  initialConcentration: number = 15.0, // Default to basal
  startTimeMinutes: number = 0
): SimulationPoint[] {
  const results: SimulationPoint[] = [];
  
  // Weight-based scaling
  const weightFactor = weight / 70;
  const cl = CL_STD * Math.pow(weightFactor, 0.75);
  const vd = V_STD * weightFactor;
  const ke = cl / vd;

  // Bateman function for a single dose (returns nmol/L)
  const calcBateman = (D: number, tHours: number) => {
    if (tHours <= 0) return 0;
    // C(t) = [D * F * ka / (Vd * (ka - ke))] * (exp(-ke*t) - exp(-ka*t))
    const factor = (D * F_BIO * KA) / (vd * (KA - ke));
    const concMgL = factor * (Math.exp(-ke * tHours) - Math.exp(-KA * tHours));
    return concMgL * CONVERSION_FACTOR;
  };

  for (let t_offset = 0; t_offset <= durationMinutes; t_offset++) {
    const t_current_abs = startTimeMinutes + t_offset;
    let totalConcentration = 0;

    // Superposition of all pulses
    for (const pulse of pulses) {
      let timeElapsedMin = (t_current_abs - pulse.time);
      
      while (timeElapsedMin < 0) {
        timeElapsedMin += 1440;
      }

      // Add contribution from the most recent occurrence of this pulse
      totalConcentration += calcBateman(pulse.dose, timeElapsedMin / 60);
      
      // Add contribution from previous day
      totalConcentration += calcBateman(pulse.dose, (timeElapsedMin + 1440) / 60);
    }

    results.push({
      time: t_current_abs,
      concentration: totalConcentration + C_BASAL
    });
  }

  return results;
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
    // Assuming sim starts at 0 and has 1-min steps
    const point = sim[t];
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
    const point = sim[t];
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
  initialC: number
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

  let currentError = calculateError(simulate(weight, currentPulses, 1440, initialC, 0));
  
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
        const newError = calculateError(simulate(weight, currentPulses, 1440, initialC, 0));
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
        const newError = calculateError(simulate(weight, currentPulses, 1440, initialC, 0));
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
