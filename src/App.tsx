import React, { useState, useMemo, useEffect } from 'react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  ReferenceLine,
  Line,
  ComposedChart
} from 'recharts';
import { 
  Activity, 
  Settings2, 
  TrendingUp, 
  ChevronRight,
  Info,
  Wand2,
  Target,
  Plus,
  Minus,
  Scale,
  Calculator
} from 'lucide-react';
import { 
  simulate, 
  STANDARD_PULSES, 
  SimulationPoint,
  calculateError,
  calculateSSE,
  optimizeDoses,
  getTargetAt,
  Pulse,
  PATIENT_MEASUREMENTS,
  PKModelType,
  CortisolType,
  PKParams,
  DEFAULT_PK_PARAMS,
  fitModelToMeasurements,
  WerumeusParams
} from './models/violarisModel';

const parseWeightSafe = (val: string, fallback = 20): number => {
  const parsed = parseFloat(val);
  return isNaN(parsed) || parsed <= 0.1 ? fallback : parsed;
};

const parseAgeSafe = (val: string, fallback = 10): number => {
  const parsed = parseFloat(val);
  return isNaN(parsed) || parsed <= 0.01 ? fallback : parsed;
};

export default function App() {
  const [pulses, setPulses] = useState<Pulse[]>(STANDARD_PULSES);
  const [weight, setWeight] = useState<string>('20');
  const [age, setAge] = useState<string>('10');
  const [selectedModel, setSelectedModel] = useState<PKModelType>(PKModelType.WERUMEUS_BUNING_2017);
  const [cortisolType, setCortisolType] = useState<CortisolType>(CortisolType.TOTAL);
  const [pkParams, setPkParams] = useState<PKParams>(DEFAULT_PK_PARAMS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customMeasurements, setCustomMeasurements] = useState<{ time: number; val: number }[]>(PATIENT_MEASUREMENTS);
  const [simulationData, setSimulationData] = useState<(SimulationPoint & { target: number })[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [errorScore, setErrorScore] = useState<number | null>(null);
  const [sseScore, setSseScore] = useState<number>(0);
  const [isFitting, setIsFitting] = useState(false);

  const totalDailyDose = useMemo(() => {
    return pulses.reduce((acc, p) => acc + p.dose, 0);
  }, [pulses]);

  const mgPerKgDay = useMemo(() => {
    const w = parseWeightSafe(weight);
    return w > 0 ? totalDailyDose / w : 0;
  }, [totalDailyDose, weight]);

  const runSimulation = (currentPulses?: Pulse[]) => {
    const p = [...(currentPulses || pulses)].sort((a, b) => a.time - b.time);
    const w = parseWeightSafe(weight);
    const ageDays = parseAgeSafe(age) * 365;

    const fullSim = simulate(w, p, selectedModel, ageDays, cortisolType, pkParams, 1440, 0); // Start at 00:00
    const dataWithTarget = fullSim.map(point => {
      const m = point.time % 1440;
      const patientPoint = customMeasurements.find(pm => pm.time === m);
      return {
        ...point,
        target: getTargetAt(point.time),
        patient: patientPoint ? patientPoint.val : null
      };
    });
    
    setSimulationData(dataWithTarget);
    setErrorScore(calculateError(fullSim));
    setSseScore(calculateSSE(fullSim));
  };

  useEffect(() => {
    runSimulation();
  }, [weight, age, pulses, selectedModel, cortisolType, pkParams, customMeasurements]);

  const handleOptimize = () => {
    const w = parseWeightSafe(weight);
    const ageDays = parseAgeSafe(age) * 365;
    const optimized = optimizeDoses(w, pulses, selectedModel, ageDays, cortisolType, pkParams);
    setPulses(optimized);
  };

  const handleAddMeasurement = () => {
    const lastM = customMeasurements[customMeasurements.length - 1];
    const newTime = lastM ? (lastM.time + 120) % 1440 : 720;
    const sorted = [...customMeasurements, { time: newTime, val: 100 }].sort((a, b) => a.time - b.time);
    setCustomMeasurements(sorted);
  };

  const handleRemoveMeasurement = (index: number) => {
    setCustomMeasurements(customMeasurements.filter((_, i) => i !== index));
  };

  const handleMeasurementChange = (index: number, field: 'time' | 'val', value: number) => {
    const nextArr = [...customMeasurements];
    nextArr[index] = {
      ...nextArr[index],
      [field]: value
    };
    if (field === 'time') {
      nextArr.sort((a, b) => a.time - b.time);
    }
    setCustomMeasurements(nextArr);
  };

  const handleCalibratePK = () => {
    setIsFitting(true);
    setTimeout(() => {
      const w = parseWeightSafe(weight);
      const ageDays = parseAgeSafe(age) * 365;
      
      const fitted = fitModelToMeasurements(w, ageDays, pulses, cortisolType, customMeasurements);
      
      setPkParams(prev => ({
        ...prev,
        customFit: {
          ka: fitted.ka,
          clTotal: fitted.clTotal,
          vdTotal: fitted.vdTotal,
          clFree: fitted.clFree,
          vdFree: fitted.vdFree,
          f: fitted.f
        }
      }));
      
      setSelectedModel(PKModelType.CUSTOM_FIT);
      setIsFitting(false);
    }, 100);
  };

  const updatePulseDose = (index: number, delta: number) => {
    const newPulses = [...pulses];
    newPulses[index].dose = Math.max(0, Math.round((newPulses[index].dose + delta) * 10) / 10);
    setPulses(newPulses);
  };

  const handlePulseDoseChange = (index: number, value: string) => {
    const newPulses = [...pulses];
    const val = parseFloat(value);
    if (!isNaN(val)) {
      newPulses[index].dose = Math.max(0, val);
    } else if (value === '') {
      newPulses[index].dose = 0;
    }
    setPulses(newPulses);
  };

  const handlePulseTimeChange = (index: number, timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    
    const newPulses = [...pulses];
    newPulses[index].time = totalMinutes;
    setPulses(newPulses);
  };

  const addPulse = () => {
    const lastPulse = pulses[pulses.length - 1];
    const newTime = lastPulse ? (lastPulse.time + 120) % 1440 : 480;
    const newPulses = [...pulses, { time: newTime, dose: 2.0 }];
    setPulses(newPulses);
  };

  const removePulse = (index: number) => {
    const newPulses = pulses.filter((_, i) => i !== index);
    setPulses(newPulses);
  };

  const pkStats = useMemo(() => {
    const w = parseWeightSafe(weight, 70);
    const weightFactor = w / 70;
    const weightFactorCL = Math.pow(w / 70, 0.75); // Allometric scaling for clearance
    
    // Binding ratio factor for conversions (derived from Kd=30, Bmax=400, NS=1.5)
    // At low concentrations, Total approx equals Free * 15.8
    const bindingRatio = 15.8;

    if (selectedModel === PKModelType.WERUMEUS_BUNING_2017 || selectedModel === PKModelType.CLINICAL_ADJUSTED || selectedModel === PKModelType.MELIN_2020 || selectedModel === PKModelType.CUSTOM_FIT) {
      let clBase, vdBase;
      
      const pSet = selectedModel === PKModelType.MELIN_2020 ? pkParams.melin : 
                   selectedModel === PKModelType.WERUMEUS_BUNING_2017 ? pkParams.werumeus : 
                   selectedModel === PKModelType.CUSTOM_FIT ? pkParams.customFit :
                   pkParams.clinical;
      
      if (selectedModel === PKModelType.MELIN_2020) {
        // Melin only provides Total parameters. We estimate Free if needed.
        if (cortisolType === CortisolType.TOTAL) {
          clBase = pSet.cl;
          vdBase = pSet.vc;
        } else {
          clBase = pSet.cl * bindingRatio;
          vdBase = pSet.vc * bindingRatio;
        }
      } else {
        // Werumeus/Clinical have both
        const wSet = pSet as WerumeusParams;
        clBase = cortisolType === CortisolType.TOTAL ? wSet.clTotal : wSet.clFree;
        vdBase = cortisolType === CortisolType.TOTAL ? wSet.vdTotal : wSet.vdFree;
      }
      
      const cl = clBase * weightFactorCL;
      const vd = vdBase * weightFactor;
      const ke = cl / (vd || 5.0); // Guard against vc or vd being or tending to 0
      const tHalf = Math.LN2 / (ke || 0.1);
      
      return {
        cl: cl.toFixed(1),
        tHalf: (tHalf * 60).toFixed(1),
        type: cortisolType
      };
    } else {
      // Michelet Models (EJE and Frontiers)
      const pSet = selectedModel === PKModelType.MICHELET_2023 ? pkParams.micheletV2 : pkParams.michelet;
      let clFree = pSet.cl * weightFactorCL;
      
      if (selectedModel === PKModelType.MICHELET_2023) {
        const y = parseAgeSafe(age);
        const factor_maduracion = 0.4 + 0.6 * (1 - Math.exp(-0.5 * y));
        clFree *= factor_maduracion;
      }

      // Apparent CL for Total vs Free
      let displayCL = clFree;
      if (cortisolType === CortisolType.TOTAL) {
        displayCL = clFree / bindingRatio;
      }
      
      const vc = pSet.vc * weightFactor;
      const vp = pSet.vp * weightFactor;
      const vdTotal = (vc + vp) * (cortisolType === CortisolType.TOTAL ? bindingRatio / 2 : 1); // Approximation for total volume
      
      const ke_eff = displayCL / (vdTotal || 5.0);
      const tHalf = Math.LN2 / (ke_eff || 0.1);
      
      return {
        cl: displayCL.toFixed(1),
        tHalf: (tHalf * 60).toFixed(1),
        type: cortisolType
      };
    }
  }, [weight, age, selectedModel, cortisolType, pkParams]);
  const peaks = useMemo(() => {
    if (simulationData.length === 0) return [];
    const localPeaks: { time: string; value: number }[] = [];
    for (let i = 1; i < simulationData.length - 1; i++) {
      if (simulationData[i].concentration > simulationData[i - 1].concentration && 
          simulationData[i].concentration > simulationData[i + 1].concentration &&
          simulationData[i].concentration > 50) {
        const hours = Math.floor(simulationData[i].time / 60);
        const mins = simulationData[i].time % 60;
        localPeaks.push({
          time: `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`,
          value: Math.round(simulationData[i].concentration)
        });
      }
    }
    return localPeaks;
  }, [simulationData]);

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-white text-[#1e293b] font-sans selection:bg-indigo-600 selection:text-white antialiased">
      <header className="border-b border-slate-100 bg-white p-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100 shrink-0">
              <Activity size={18} />
            </span>
            <h1 className="text-3xl font-serif italic tracking-tight text-slate-900 leading-tight">Modelo de Ajuste de Hidrocortisona</h1>
          </div>
          <p className="text-xs uppercase tracking-widest text-slate-400 font-mono flex flex-wrap items-center gap-2">
            <span>Dose Adaptation Protocol</span>
            <span className="h-3 w-[1px] bg-slate-200 hidden sm:inline"></span>
            <span className="text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded text-[8px] tracking-normal inline-block">v4.1 Clinical Simulator</span>
          </p>
        </div>
        
        {/* Core Stats overview badges */}
        <div className="flex flex-wrap gap-3">
          <div className="bg-indigo-50/50 border border-indigo-100/50 px-4 py-2 rounded-md text-right min-w-[130px] shadow-sm">
            <span className="text-[8px] font-mono uppercase text-indigo-900/60 block font-bold">Dosis Total Diaria</span>
            <span className="text-lg font-mono font-bold text-indigo-950">{totalDailyDose.toFixed(1)} <span className="text-xs font-semibold">mg</span></span>
          </div>
          <div className="bg-emerald-50/50 border border-emerald-100/50 px-4 py-2 rounded-md text-right min-w-[135px] shadow-sm">
            <span className="text-[8px] font-mono uppercase text-emerald-900/60 block font-bold font-bold">Dosis Relativa</span>
            <span className="text-lg font-mono font-bold text-emerald-950">{mgPerKgDay.toFixed(3)} <span className="text-[9px] font-semibold">mg/kg/d</span></span>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-[calc(100vh-100px)]">
        {/* Left Column: Patient clinical input & custom parameters calibration */}
        <section className="lg:col-span-4 border-r border-slate-100 p-6 space-y-6 bg-slate-50/50 overflow-y-auto max-h-[calc(100vh-100px)]">
          
          {/* PASO 1: Datos Clínicos y Demográficos */}
          <div className="bg-white border border-slate-100 shadow-sm p-5 rounded-lg space-y-4">
            <div className="flex items-center gap-2 text-indigo-700">
              <Settings2 size={16} />
              <h2 className="text-xs font-mono uppercase tracking-wider font-bold">1. Datos del Paciente</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="group">
                <label className="text-[9px] font-mono uppercase opacity-65 block mb-1 font-bold text-slate-500">Peso (kg)</label>
                <div className="flex items-center gap-1.5 border border-slate-200 focus-within:border-indigo-600 rounded-sm p-1.5 bg-slate-50/50 transition-colors">
                  <Scale size={13} className="text-slate-400" />
                  <input 
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-full bg-transparent font-mono text-xs outline-none"
                    placeholder="20"
                  />
                </div>
              </div>
              <div className="group">
                <label className="text-[9px] font-mono uppercase opacity-65 block mb-1 font-bold text-slate-500">Edad (años)</label>
                <div className="flex items-center gap-1.5 border border-slate-200 focus-within:border-indigo-600 rounded-sm p-1.5 bg-slate-50/50 transition-colors">
                  <Activity size={13} className="text-slate-400" />
                  <input 
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="w-full bg-transparent font-mono text-xs outline-none"
                    placeholder="10"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-mono uppercase opacity-65 font-bold text-slate-500">Ritmo Fisiológico Objetivo</span>
                <span className="bg-rose-50 border border-rose-100 text-rose-700 font-mono text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">Circadiano</span>
              </div>
              <div className="h-16 bg-slate-50/50 rounded-sm p-1 overflow-hidden border border-slate-100">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={Array.from({length: 24}, (_, i) => ({time: i*60, val: getTargetAt(i*60)}))}>
                    <defs>
                      <linearGradient id="roseGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="val" stroke="#f43f5e" fill="url(#roseGradient)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[8px] font-mono text-slate-400 mt-1.5 leading-tight">Ritmo de secreción ideal natural para Cortisol (línea rosa en gráfica principal).</p>
            </div>
          </div>

          {/* PASO 2: Datos de Concentración Real y Calibración PK */}
          <div className="bg-white border border-slate-100 shadow-sm p-5 rounded-lg space-y-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-indigo-700">
                <Calculator size={16} />
                <h2 className="text-xs font-mono uppercase tracking-wider font-bold">2. Concentración Real y Calibración</h2>
              </div>
              <p className="text-[9px] font-mono text-slate-400 leading-snug">
                Registra concentraciones de cortisol reales y calibra para ajustar la farmacocinética del niño de forma personalizada.
              </p>
            </div>

            {/* List of custom measurements */}
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-[9px] font-mono uppercase font-bold text-slate-500">Puntos Registrados ({customMeasurements.length})</span>
                <button
                  type="button"
                  onClick={handleAddMeasurement}
                  className="text-[9px] font-mono font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  + Añadir Punto
                </button>
              </div>
              
              {customMeasurements.length === 0 ? (
                <div className="text-center py-4 text-slate-400 font-serif italic text-xs border border-dashed border-slate-200 rounded bg-slate-50/50">
                  Sin mediciones añadidas.
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                  {customMeasurements.map((m, index) => (
                    <div key={index} className="bg-slate-50/60 border border-slate-100/80 rounded p-2 flex items-center justify-between gap-2 shadow-inner relative group">
                      <div className="flex items-center gap-1.5 flex-1">
                        <div className="flex flex-col flex-1">
                          <span className="text-[7px] font-mono uppercase text-slate-400 font-bold">Hora</span>
                          <input
                            type="time"
                            value={formatTime(m.time)}
                            onChange={(e) => {
                              const timeStr = e.target.value;
                              if (timeStr) {
                                const [h, min] = timeStr.split(':').map(Number);
                                handleMeasurementChange(index, 'time', (h * 60 + min) % 1440);
                              }
                            }}
                            className="font-mono border border-slate-200 bg-white rounded-sm px-1 py-0.5 text-[10px] outline-none focus:border-indigo-600 text-center w-full"
                          />
                        </div>
                        <div className="flex flex-col flex-1">
                          <span className="text-[7px] font-mono uppercase text-slate-400 font-bold">Conc (nmol/L)</span>
                          <input
                            type="number"
                            value={m.val}
                            onChange={(e) => {
                              let val = parseFloat(e.target.value);
                              if (isNaN(val)) val = 0;
                              handleMeasurementChange(index, 'val', val);
                            }}
                            className="font-mono border border-slate-200 bg-white rounded-sm px-1 py-0.5 text-[10px] outline-none focus:border-indigo-600 text-center w-full"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMeasurement(index)}
                        className="text-slate-400 hover:text-red-500 font-bold px-1 rounded hover:bg-slate-200/50 text-xs self-end pb-0.5 transition-colors cursor-pointer"
                        title="Eliminar punto"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCustomMeasurements(PATIENT_MEASUREMENTS)}
                className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-mono text-[9px] uppercase font-bold py-1.5 rounded transition-colors cursor-pointer text-center"
              >
                Cargar Demo
              </button>
              <button
                type="button"
                onClick={() => setCustomMeasurements([])}
                className="border border-red-200 hover:bg-red-50 text-red-600 font-mono text-[9px] uppercase font-bold py-1.5 rounded transition-colors cursor-pointer text-center"
              >
                Limpiar Todo
              </button>
            </div>

            <button
              type="button"
              onClick={handleCalibratePK}
              disabled={isFitting || customMeasurements.length === 0}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-mono text-[10px] uppercase font-bold py-2 px-3 tracking-wider rounded-md transition-all shadow-sm shadow-indigo-100 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {isFitting ? (
                <>
                  <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Calibrando...
                </>
              ) : (
                <>
                  <Calculator size={12} />
                  Calibrar Modelo PK
                </>
              )}
            </button>
          </div>

          {/* PASO 3: Modelo Farmacocinético y Parámetros */}
          <div className="bg-white border border-slate-100 shadow-sm p-5 rounded-lg space-y-4">
            <div className="flex items-center gap-2 text-indigo-700">
              <TrendingUp size={16} />
              <h2 className="text-xs font-mono uppercase tracking-wider font-bold">3. Modelo Farmacocinético</h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[8px] font-mono uppercase opacity-65 block mb-1 font-bold text-slate-500">Selección del Modelo</label>
                <div className="flex flex-col gap-1 bg-slate-50 border border-slate-100 p-1 rounded-sm">
                  {Object.values(PKModelType).map((model) => (
                    <button
                      key={model}
                      onClick={() => setSelectedModel(model)}
                      className={`py-1.5 px-2 text-[9px] font-mono uppercase tracking-tighter transition-all rounded-[2px] text-left flex items-center justify-between ${
                        selectedModel === model 
                          ? 'bg-indigo-600 text-white font-bold shadow-sm' 
                          : 'hover:bg-slate-200/50 text-slate-600 hover:text-slate-900 font-medium'
                      }`}
                    >
                      <span>{model}</span>
                      {selectedModel === model && <ChevronRight size={10} />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[8px] font-mono uppercase opacity-65 block mb-1 font-bold text-slate-500">Tipo de Medida</label>
                <div className="flex gap-0.5 bg-slate-50 border border-slate-100 p-0.5 rounded-sm">
                  {Object.values(CortisolType).map((type) => (
                    <button
                      key={type}
                      onClick={() => setCortisolType(type)}
                      className={`flex-1 py-1 px-1.5 text-[8px] font-mono uppercase tracking-tighter transition-all ${
                        cortisolType === type 
                          ? 'bg-indigo-600 text-white rounded-[1px] font-bold shadow-sm' 
                          : 'hover:bg-slate-200/50 text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-[9px] leading-relaxed text-slate-500/90 italic">
              {selectedModel === PKModelType.WERUMEUS_BUNING_2017 
                ? `Modelo lineal (Werumeus ADULTOS) para Cortisol ${cortisolType}.`
                : selectedModel === PKModelType.MELIN_2020
                ? `Modelo lineal (Melin) para CAH pediátrico.`
                : selectedModel === PKModelType.MICHELET_2023
                ? `Modelo Michelet_Frontiers con función de maduración dinámica y edad.`
                : selectedModel === PKModelType.CLINICAL_ADJUSTED
                ? `Modelo Clínico ajustado de dos compartimentos.`
                : selectedModel === PKModelType.CUSTOM_FIT
                ? `Modelo adaptado y calibrado a partir de las mediciones reales del paciente.`
                : `Modelo Michelet_EJE de dos compartimentos.`}
            </p>

            <div className="bg-slate-50/50 border border-slate-100 p-3 rounded-sm space-y-2">
              <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Parámetros PK</span>
                <button 
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-[9px] font-mono text-indigo-600 hover:underline hover:text-indigo-800 font-bold"
                >
                  {showAdvanced ? 'Ocultar' : 'Editar'}
                </button>
              </div>

              {(selectedModel === PKModelType.WERUMEUS_BUNING_2017 || selectedModel === PKModelType.CLINICAL_ADJUSTED || selectedModel === PKModelType.MELIN_2020 || selectedModel === PKModelType.CUSTOM_FIT) ? (
                <>
                  {showAdvanced ? (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="space-y-0.5">
                        <label className="text-[7px] uppercase font-bold text-slate-400 font-bold">Ka (h⁻¹)</label>
                        <input 
                          type="number" step="0.1"
                          value={selectedModel === PKModelType.MELIN_2020 ? pkParams.melin.ka : (selectedModel === PKModelType.WERUMEUS_BUNING_2017 ? pkParams.werumeus.ka : selectedModel === PKModelType.CUSTOM_FIT ? pkParams.customFit.ka : pkParams.clinical.ka)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            if (selectedModel === PKModelType.MELIN_2020) {
                              setPkParams({ ...pkParams, melin: { ...pkParams.melin, ka: val }});
                            } else if (selectedModel === PKModelType.WERUMEUS_BUNING_2017) {
                              setPkParams({ ...pkParams, werumeus: { ...pkParams.werumeus, ka: val }});
                            } else if (selectedModel === PKModelType.CUSTOM_FIT) {
                              setPkParams({ ...pkParams, customFit: { ...pkParams.customFit, ka: val }});
                            } else {
                              setPkParams({ ...pkParams, clinical: { ...pkParams.clinical, ka: val }});
                            }
                          }}
                          className="w-full text-[10px] font-mono border border-slate-200 px-1 py-0.5 bg-white rounded-sm outline-none focus:border-indigo-600"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[7px] uppercase font-bold text-slate-400 font-bold">Ke (h⁻¹)</label>
                        <input 
                          type="number" step="0.01"
                          value={selectedModel === PKModelType.MELIN_2020 ? (pkParams.melin.cl / pkParams.melin.vc) : (selectedModel === PKModelType.WERUMEUS_BUNING_2017 
                            ? (pkParams.werumeus.clTotal / pkParams.werumeus.vdTotal) 
                            : selectedModel === PKModelType.CUSTOM_FIT ? (pkParams.customFit.clTotal / pkParams.customFit.vdTotal) : (pkParams.clinical.clTotal / pkParams.clinical.vdTotal))}
                          onChange={(e) => {
                            const ke = parseFloat(e.target.value) || 0;
                            if (selectedModel === PKModelType.MELIN_2020) {
                              setPkParams({ ...pkParams, melin: { ...pkParams.melin, cl: ke * pkParams.melin.vc }});
                            } else if (selectedModel === PKModelType.WERUMEUS_BUNING_2017) {
                              setPkParams({ ...pkParams, werumeus: { ...pkParams.werumeus, clTotal: ke * pkParams.werumeus.vdTotal }});
                            } else if (selectedModel === PKModelType.CUSTOM_FIT) {
                              setPkParams({ ...pkParams, customFit: { ...pkParams.customFit, clTotal: ke * pkParams.customFit.vdTotal }});
                            } else {
                              setPkParams({ ...pkParams, clinical: { ...pkParams.clinical, clTotal: ke * pkParams.clinical.vdTotal }});
                            }
                          }}
                          className="w-full text-[10px] font-mono border border-slate-200 px-1 py-0.5 bg-white rounded-sm outline-none focus:border-indigo-600"
                        />
                      </div>
                      <div className="space-y-0.5 col-span-2">
                        <label className="text-[7px] uppercase font-bold text-slate-400 font-bold">Vd (L)</label>
                        <input 
                          type="number" step="0.1"
                          value={selectedModel === PKModelType.MELIN_2020 ? pkParams.melin.vc : (selectedModel === PKModelType.WERUMEUS_BUNING_2017 ? pkParams.werumeus.vdTotal : selectedModel === PKModelType.CUSTOM_FIT ? pkParams.customFit.vdTotal : pkParams.clinical.vdTotal)}
                          onChange={(e) => {
                            const vd = parseFloat(e.target.value) || 0;
                            if (selectedModel === PKModelType.MELIN_2020) {
                                const ke = pkParams.melin.cl / pkParams.melin.vc;
                                setPkParams({ ...pkParams, melin: { ...pkParams.melin, vc: vd, cl: ke * vd }});
                            } else if (selectedModel === PKModelType.WERUMEUS_BUNING_2017) {
                              const ke = pkParams.werumeus.clTotal / pkParams.werumeus.vdTotal;
                              setPkParams({ ...pkParams, werumeus: { ...pkParams.werumeus, vdTotal: vd, clTotal: ke * vd }});
                            } else if (selectedModel === PKModelType.CUSTOM_FIT) {
                              const ke = pkParams.customFit.clTotal / pkParams.customFit.vdTotal;
                              setPkParams({ ...pkParams, customFit: { ...pkParams.customFit, vdTotal: vd, clTotal: ke * vd }});
                            } else {
                              const ke = pkParams.clinical.clTotal / pkParams.clinical.vdTotal;
                              setPkParams({ ...pkParams, clinical: { ...pkParams.clinical, vdTotal: vd, clTotal: ke * vd }});
                            }
                          }}
                          className="w-full text-[10px] font-mono border border-slate-200 px-1 py-0.5 bg-white rounded-sm outline-none focus:border-indigo-600"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-60 text-slate-500 uppercase">Ka (Absorción)</span>
                        <span className="font-bold text-slate-800">{(selectedModel === PKModelType.MELIN_2020 ? pkParams.melin.ka : (selectedModel === PKModelType.WERUMEUS_BUNING_2017 ? pkParams.werumeus.ka : selectedModel === PKModelType.CUSTOM_FIT ? pkParams.customFit.ka : pkParams.clinical.ka)).toFixed(2)} h⁻¹</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-60 text-slate-500 uppercase">Ke (Eliminación)</span>
                        <span className="font-bold text-slate-800">{(selectedModel === PKModelType.MELIN_2020 ? (pkParams.melin.cl / pkParams.melin.vc) : (selectedModel === PKModelType.WERUMEUS_BUNING_2017 
                          ? (pkParams.werumeus.clTotal / pkParams.werumeus.vdTotal) 
                          : selectedModel === PKModelType.CUSTOM_FIT ? (pkParams.customFit.clTotal / pkParams.customFit.vdTotal) : (pkParams.clinical.clTotal / pkParams.clinical.vdTotal))).toFixed(2)} h⁻¹</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-60 text-slate-500 uppercase">Vd (70kg)</span>
                        <span className="font-bold text-slate-800">{selectedModel === PKModelType.MELIN_2020 
                          ? pkParams.melin.vc
                          : (cortisolType === CortisolType.TOTAL 
                            ? (selectedModel === PKModelType.WERUMEUS_BUNING_2017 ? pkParams.werumeus.vdTotal : selectedModel === PKModelType.CUSTOM_FIT ? pkParams.customFit.vdTotal : pkParams.clinical.vdTotal) 
                            : (selectedModel === PKModelType.WERUMEUS_BUNING_2017 ? pkParams.werumeus.vdFree : selectedModel === PKModelType.CUSTOM_FIT ? pkParams.customFit.vdFree : pkParams.clinical.vdFree))} L</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {showAdvanced ? (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="space-y-0.5">
                        <label className="text-[7px] uppercase font-bold text-slate-400 font-bold">Vmax Abs</label>
                        <input 
                          type="number"
                          value={selectedModel === PKModelType.MICHELET_2023 ? pkParams.micheletV2.vmaxAbs : pkParams.michelet.vmaxAbs}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            if (selectedModel === PKModelType.MICHELET_2023) {
                              setPkParams({ ...pkParams, micheletV2: { ...pkParams.micheletV2, vmaxAbs: val }});
                            } else {
                              setPkParams({ ...pkParams, michelet: { ...pkParams.michelet, vmaxAbs: val }});
                            }
                          }}
                          className="w-full text-[10px] font-mono border border-slate-200 px-1 py-0.5 bg-white rounded-sm outline-none focus:border-indigo-600"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[7px] uppercase font-bold text-slate-400 font-bold">Km Abs</label>
                        <input 
                          type="number"
                          value={selectedModel === PKModelType.MICHELET_2023 ? pkParams.micheletV2.kmAbs : pkParams.michelet.kmAbs}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            if (selectedModel === PKModelType.MICHELET_2023) {
                              setPkParams({ ...pkParams, micheletV2: { ...pkParams.micheletV2, kmAbs: val }});
                            } else {
                              setPkParams({ ...pkParams, michelet: { ...pkParams.michelet, kmAbs: val }});
                            }
                          }}
                          className="w-full text-[10px] font-mono border border-slate-200 px-1 py-0.5 bg-white rounded-sm outline-none focus:border-indigo-600"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[7px] uppercase font-bold text-slate-400 font-bold font-bold">CL/F (70kg)</label>
                        <input 
                          type="number"
                          value={selectedModel === PKModelType.MICHELET_2023 ? pkParams.micheletV2.cl : pkParams.michelet.cl}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            if (selectedModel === PKModelType.MICHELET_2023) {
                              setPkParams({ ...pkParams, micheletV2: { ...pkParams.micheletV2, cl: val }});
                            } else {
                              setPkParams({ ...pkParams, michelet: { ...pkParams.michelet, cl: val }});
                            }
                          }}
                          className="w-full text-[10px] font-mono border border-slate-200 px-1 py-0.5 bg-white rounded-sm outline-none focus:border-indigo-600"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[7px] uppercase font-bold text-slate-400 font-bold font-bold">Vc/F (70kg)</label>
                        <input 
                          type="number"
                          value={selectedModel === PKModelType.MICHELET_2023 ? pkParams.micheletV2.vc : pkParams.michelet.vc}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            if (selectedModel === PKModelType.MICHELET_2023) {
                              setPkParams({ ...pkParams, micheletV2: { ...pkParams.micheletV2, vc: val }});
                            } else {
                              setPkParams({ ...pkParams, michelet: { ...pkParams.michelet, vc: val }});
                            }
                          }}
                          className="w-full text-[10px] font-mono border border-slate-200 px-1 py-0.5 bg-white rounded-sm outline-none focus:border-indigo-600"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[7px] uppercase font-bold text-slate-400 font-bold font-bold font-bold">Q/F (70kg)</label>
                        <input 
                          type="number"
                          value={selectedModel === PKModelType.MICHELET_2023 ? pkParams.micheletV2.q : pkParams.michelet.q}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            if (selectedModel === PKModelType.MICHELET_2023) {
                              setPkParams({ ...pkParams, micheletV2: { ...pkParams.micheletV2, q: val }});
                            } else {
                              setPkParams({ ...pkParams, michelet: { ...pkParams.michelet, q: val }});
                            }
                          }}
                          className="w-full text-[10px] font-mono border border-slate-200 px-1 py-0.5 bg-white rounded-sm outline-none focus:border-indigo-600"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[7px] uppercase font-bold text-slate-400 font-bold font-bold">Vp/F (70kg)</label>
                        <input 
                          type="number"
                          value={selectedModel === PKModelType.MICHELET_2023 ? pkParams.micheletV2.vp : pkParams.michelet.vp}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            if (selectedModel === PKModelType.MICHELET_2023) {
                              setPkParams({ ...pkParams, micheletV2: { ...pkParams.micheletV2, vp: val }});
                            } else {
                              setPkParams({ ...pkParams, michelet: { ...pkParams.michelet, vp: val }});
                            }
                          }}
                          className="w-full text-[10px] font-mono border border-slate-200 px-1 py-0.5 bg-white rounded-sm outline-none focus:border-indigo-600"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 pt-1 opacity-90">
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-60 mb-0.5 text-slate-500 uppercase">Vmax_abs</span>
                        <span className="font-bold text-slate-800">{(selectedModel === PKModelType.MICHELET_2023 ? pkParams.micheletV2.vmaxAbs : pkParams.michelet.vmaxAbs).toLocaleString()} nmol/h</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-60 mb-0.5 text-slate-500 uppercase">Km_abs</span>
                        <span className="font-bold text-slate-800">{(selectedModel === PKModelType.MICHELET_2023 ? pkParams.micheletV2.kmAbs : pkParams.michelet.kmAbs).toLocaleString()} nmol</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-60 mb-0.5 text-slate-500 uppercase">CL/F (70kg)</span>
                        <span className="font-bold text-slate-800">{(selectedModel === PKModelType.MICHELET_2023 ? pkParams.micheletV2.cl : pkParams.michelet.cl).toFixed(0)} L/h</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-60 mb-0.5 text-slate-500 uppercase">Vc/F (70kg)</span>
                        <span className="font-bold text-slate-800">{(selectedModel === PKModelType.MICHELET_2023 ? pkParams.micheletV2.vc : pkParams.michelet.vc)} L</span>
                      </div>
                    </div>
                  )}
                  {cortisolType === CortisolType.TOTAL && (
                    <div className="pt-2 mt-2 border-t border-slate-100 space-y-1 text-slate-500">
                      <div className="flex justify-between text-[8px] font-mono">
                        <span>CBG (Bmax)</span>
                        <span className="font-bold text-slate-700">400 nmol/L</span>
                      </div>
                      <div className="flex justify-between text-[8px] font-mono">
                        <span>Kd (Afinidad)</span>
                        <span className="font-bold text-slate-700">30 nmol/L</span>
                      </div>
                      <div className="flex justify-between text-[8px] font-mono">
                        <span>Albúmina (NS)</span>
                        <span className="font-bold text-slate-700">1.5x</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* Right Column: Interactive Sim Chart, Stats & Dosage adaptative panels */}
        <section className="lg:col-span-8 p-6 md:p-8 flex flex-col bg-white overflow-y-auto max-h-[calc(100vh-100px)] space-y-6">
          
          {/* Fila de Tarjetas con las Estadísticas e Indicadores Clave de Ajuste */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-indigo-50/30 border border-indigo-100/30 p-3.5 rounded-xl shadow-sm">
              <div className="flex items-center gap-1">
                <span className="text-[8px] font-mono text-indigo-950/60 uppercase tracking-wider block font-bold">Aclaramiento CL ({pkStats.type})</span>
                <div className="group relative">
                  <Info size={10} className="text-indigo-600 cursor-help opacity-70" />
                  <div className="absolute left-0 bottom-full mb-2 w-48 bg-slate-900 text-white text-[9px] p-2 rounded shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    Normalizado al tipo de cortisol seleccionado para permitir la comparativa entre modelos (Total vs Libre).
                  </div>
                </div>
              </div>
              <span className="text-xl font-mono font-bold text-indigo-950 mt-1 block">{pkStats.cl} <span className="text-xs font-normal opacity-60">L/h</span></span>
            </div>
            
            <div className="bg-indigo-50/30 border border-indigo-100/30 p-3.5 rounded-xl shadow-sm">
              <span className="text-[8px] font-mono text-indigo-950/60 uppercase tracking-wider block font-bold">Semivida (t½)</span>
              <span className="text-xl font-mono font-bold text-indigo-950 mt-1 block">{pkStats.tHalf} <span className="text-xs font-normal opacity-60">min</span></span>
            </div>

            <div className="bg-emerald-50/40 border border-emerald-100/40 p-3.5 rounded-xl shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-mono text-emerald-950/60 uppercase tracking-wider block font-bold font-bold">Ajuste Modelo (SSE)</span>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
              <span className="text-xl font-mono font-bold text-emerald-700 mt-1 block">{sseScore.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>

            {errorScore !== null ? (
              <div className="bg-amber-50/30 border border-amber-100/30 p-3.5 rounded-xl shadow-sm">
                <span className="text-[8px] font-mono text-amber-950/60 uppercase tracking-wider block font-bold font-bold">Desviación (RMSE)</span>
                <span className="text-xl font-mono font-bold text-amber-700 mt-1 block">{errorScore.toFixed(1)} <span className="text-xs font-normal opacity-60">nmol/L</span></span>
              </div>
            ) : (
              <div className="bg-slate-50/60 border border-slate-100 p-3.5 rounded-xl shadow-sm">
                <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block font-bold font-bold">Periodo</span>
                <span className="text-xl font-mono font-bold text-slate-700 mt-1 block">24 Horas</span>
              </div>
            )}
          </div>

          {/* Gráfica Principal de Simulación de Cortisol */}
          <div className="bg-white border border-slate-100 p-5 rounded-xl shadow-sm relative flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-indigo-600"></span>
                <h3 className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-600">Perfil de Simulación de Cortisol</h3>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[9px] font-mono text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-600"></span> Curva Simulada</span>
                <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-rose-400 border-t border-dashed"></span> Ideal Fisiológico</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Curva calibrada (Mediciones)</span>
              </div>
            </div>

            <div className="h-[360px] w-full relative">
              {simulationData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={simulationData} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="predictedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b08" />
                    <XAxis 
                      dataKey="time" 
                      tickFormatter={formatTime} 
                      stroke="#64748b" 
                      fontSize={10} 
                      fontFamily="monospace"
                      ticks={[0, 180, 360, 540, 720, 900, 1080, 1260, 1440]}
                    />
                    <YAxis stroke="#64748b" fontSize={10} fontFamily="monospace" unit=" nmol" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: 'white', fontFamily: 'monospace', fontSize: '10px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelFormatter={(t) => `Hora: ${formatTime(t as number)}`}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="concentration" 
                      stroke="#2563eb" 
                      strokeWidth={2.5}
                      fill="url(#predictedGrad)"
                      name="Niveles Predichos"
                      animationDuration={400}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="target" 
                      stroke="#f43f5e" 
                      strokeWidth={1.8} 
                      strokeDasharray="5 3" 
                      dot={false}
                      opacity={0.8}
                      name="Objetivo Fisiológico"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="patient" 
                      stroke="#d97706" 
                      strokeWidth={2} 
                      dot={{ r: 5, stroke: '#b45309', strokeWidth: 1.5, fill: '#fef3c7' }}
                      connectNulls={true}
                      name="Mediciones del Niño"
                    />
                    <ReferenceLine y={400} stroke="#ef4444" strokeDasharray="3 3" opacity={0.4} label={{ value: 'Alto', position: 'insideRight', fill: '#ef4444', fontSize: 8, fontFamily: 'monospace', dy: -8 }} />
                    <ReferenceLine x={720} stroke="#cbd5e1" strokeDasharray="3 3" opacity={0.5} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-center">
                  <Calculator size={70} strokeWidth={0.5} className="text-indigo-600 animate-pulse" />
                  <p className="mt-4 font-serif italic text-lg text-slate-700">Preparado para optimizar...</p>
                  <p className="text-[10px] font-mono uppercase tracking-widest mt-1">Ajusta el peso o las dosis para simular</p>
                </div>
              )}
            </div>
          </div>

          {/* PASO 4: Régimen de Dosis y Optimización Automática (Ancha y Espaciosa debajo de la Gráfica) */}
          <div className="bg-indigo-50/15 border border-indigo-100/50 p-6 rounded-xl space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-indigo-700">
                  <Wand2 size={18} className="animate-pulse" />
                  <h2 className="text-xs font-mono uppercase tracking-wider font-bold">4. Régimen y Optimización de Dosis</h2>
                </div>
                <p className="text-[10px] font-mono text-slate-500 max-w-2xl mt-1 leading-normal">
                  Modifica las tomas de hidrocortisona en el día. Haz clic en <strong>Auto-Optimizar Dosis (Wand)</strong> para que el motor adaptativo encuentre un óptimo ajuste metabólico con el perfil circadiano del niño.
                </p>
              </div>
              
              {/* Botones de acción */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setPulses(STANDARD_PULSES)}
                  className="px-3 py-1.5 border border-indigo-200 hover:bg-indigo-50 text-indigo-700 font-mono text-[9px] uppercase font-bold tracking-wider rounded transition-all cursor-pointer flex items-center gap-1"
                  title="Restablecer"
                >
                  <Activity size={11} className="opacity-70" />
                  Restablecer
                </button>
                <button
                  onClick={handleOptimize}
                  className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-mono text-[9px] uppercase font-bold tracking-wider rounded transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-100 cursor-pointer"
                  title="Auto-Ajustar Dosis Ideales"
                >
                  <Wand2 size={12} className="rotate-12" />
                  Auto-Optimizar Dosis
                </button>
              </div>
            </div>

            {/* Doses Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {pulses.map((p, i) => {
                const h = Math.floor(p.time / 60);
                const periodLabel = h < 6 ? 'Madrugada' : h < 12 ? 'Mañana' : h < 18 ? 'Tarde' : 'Noche';
                const periodColor = h < 6 ? 'bg-purple-50 text-purple-700 border-purple-100' : h < 12 ? 'bg-amber-50 text-amber-700 border-amber-100' : h < 18 ? 'bg-sky-50 text-sky-700 border-sky-100' : 'bg-indigo-50 text-indigo-700 border-indigo-100';
                
                return (
                  <div key={i} className="bg-white border border-slate-100 p-3.5 rounded-lg flex flex-col justify-between gap-3 relative group hover:border-indigo-200 hover:shadow-sm transition-all">
                    
                    {/* Header of dose card: time and period badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                        <input 
                          type="time"
                          value={formatTime(p.time)}
                          onChange={(e) => handlePulseTimeChange(i, e.target.value)}
                          className="text-xs font-mono font-bold bg-slate-55 border border-slate-200 hover:border-slate-300 rounded px-1.5 py-0.5 outline-none focus:border-indigo-600 cursor-pointer"
                        />
                      </div>
                      <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full border ${periodColor}`}>
                        {periodLabel}
                      </span>
                    </div>

                    {/* Dose Amount Selector in the card */}
                    <div className="flex items-center justify-between border-t border-slate-50 pt-2.5">
                      <div className="flex items-center gap-1 bg-slate-50/50 p-0.5 rounded border border-slate-100">
                        <button 
                          onClick={() => updatePulseDose(i, -0.1)} 
                          className="w-5 h-5 bg-white border border-slate-200 hover:bg-slate-50 rounded flex items-center justify-center text-slate-500 transition-colors"
                        >
                          <Minus size={10} />
                        </button>
                        <div className="flex items-baseline justify-center">
                          <input 
                            type="number"
                            step="0.1"
                            min="0"
                            value={p.dose}
                            onChange={(e) => handlePulseDoseChange(i, e.target.value)}
                            className="text-xs font-mono font-bold w-9 text-center bg-transparent border-b border-transparent focus:border-indigo-600 outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="text-[8px] font-mono opacity-50 ml-0.5">mg</span>
                        </div>
                        <button 
                          onClick={() => updatePulseDose(i, 0.1)} 
                          className="w-5 h-5 bg-white border border-slate-200 hover:bg-slate-50 rounded flex items-center justify-center text-slate-500 transition-colors"
                        >
                          <Plus size={10} />
                        </button>
                      </div>

                      {/* Delete Dose Button */}
                      <button 
                        onClick={() => removePulse(i)}
                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                        title="Eliminar esta dosis"
                      >
                        <Plus size={12} className="rotate-45" />
                      </button>
                    </div>
                  </div>
                );
              })}
              
              {/* Add Dose Card */}
              <button 
                onClick={addPulse}
                className="border-2 border-dashed border-slate-200 hover:border-indigo-500/50 hover:bg-indigo-50/10 rounded-lg p-3 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-indigo-600 transition-all cursor-pointer min-h-[88px] group"
              >
                <div className="w-6 h-6 rounded-full bg-slate-50 group-hover:bg-indigo-50 flex items-center justify-center transition-colors">
                  <Plus size={13} />
                </div>
                <span className="text-[9px] font-mono uppercase font-bold tracking-wider">Añadir Toma</span>
              </button>
            </div>
          </div>

          {/* Análisis de Picos y Seguridad */}
          <div className="bg-slate-50/40 border border-slate-100 p-5 rounded-xl space-y-4 shadow-sm">
            <h3 className="text-xs font-mono uppercase tracking-widest font-bold text-slate-600 flex items-center gap-1.5">
              <Activity size={14} className="text-indigo-600" />
              Análisis Fisiológico de Picos de Cortisol
            </h3>
            
            <div className="flex flex-col md:flex-row gap-6 md:items-start justify-between">
              {/* Legend checklist */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-1 rounded-full bg-blue-600"></div>
                  <span className="text-[10px] font-mono font-semibold text-slate-700">Simulación del Niño (Concentración esperada)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-0.5 bg-rose-500 border-t border-dashed"></div>
                  <span className="text-[10px] font-mono font-semibold text-slate-700">Meta Circadiana Saludable (Línea discontinua rosa)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <div className="w-6 h-0.5 bg-amber-500"></div>
                    <div className="w-2 h-2 rounded-full bg-[#fef3c7] border border-amber-500"></div>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-slate-700">Registros Lab/Saliva del Paciente (Puntos ámbar)</span>
                </div>
              </div>
              
              {/* Peaks dynamic block */}
              <div className="flex-1">
                <span className="text-[8px] font-mono uppercase text-slate-400 block mb-2 font-bold">Resumen de Picos Detectados</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {peaks.length === 0 ? (
                    <span className="text-[10px] font-mono text-slate-400 italic">No se detectaron ondas de pico en 24h.</span>
                  ) : (
                    peaks.slice(0, 4).map((p, i) => (
                      <div key={i} className="border-l-2 border-indigo-400 pl-3">
                        <span className="text-[8px] font-mono opacity-50 block uppercase tracking-tighter">Pico {i+1} ({p.time})</span>
                        <span className="text-base font-mono font-bold text-indigo-950">{p.value} <span className="text-[9px] font-normal text-slate-500">nmol/L</span></span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
