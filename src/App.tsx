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
  DEFAULT_PK_PARAMS
} from './models/violarisModel';

export default function App() {
  const [pulses, setPulses] = useState<Pulse[]>(STANDARD_PULSES);
  const [weight, setWeight] = useState<string>('20');
  const [age, setAge] = useState<string>('10');
  const [selectedModel, setSelectedModel] = useState<PKModelType>(PKModelType.WERUMEUS_BUNING_2017);
  const [cortisolType, setCortisolType] = useState<CortisolType>(CortisolType.TOTAL);
  const [pkParams, setPkParams] = useState<PKParams>(DEFAULT_PK_PARAMS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [simulationData, setSimulationData] = useState<(SimulationPoint & { target: number })[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [errorScore, setErrorScore] = useState<number | null>(null);
  const [sseScore, setSseScore] = useState<number>(0);

  const totalDailyDose = useMemo(() => {
    return pulses.reduce((acc, p) => acc + p.dose, 0);
  }, [pulses]);

  const mgPerKgDay = useMemo(() => {
    const w = parseFloat(weight);
    if (!w || w <= 0) return 0;
    return totalDailyDose / w;
  }, [totalDailyDose, weight]);

  const runSimulation = (currentPulses?: Pulse[]) => {
    const p = [...(currentPulses || pulses)].sort((a, b) => a.time - b.time);
    const w = parseFloat(weight) || 20;
    const ageDays = (parseFloat(age) || 10) * 365;

    const fullSim = simulate(w, p, selectedModel, ageDays, cortisolType, pkParams, 1440, 0); // Start at 00:00
    const dataWithTarget = fullSim.map(point => {
      const m = point.time % 1440;
      const patientPoint = PATIENT_MEASUREMENTS.find(pm => pm.time === m);
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
  }, [weight, age, pulses, selectedModel, cortisolType, pkParams]);

  const handleOptimize = () => {
    const w = parseFloat(weight) || 20;
    const ageDays = (parseFloat(age) || 10) * 365;
    const optimized = optimizeDoses(w, pulses, selectedModel, ageDays, cortisolType, pkParams);
    setPulses(optimized);
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
    const w = parseFloat(weight) || 70;
    const weightFactor = w / 70;
    const ageDays = (parseFloat(age) || 10) * 365;
    
    if (selectedModel === PKModelType.WERUMEUS_BUNING_2017) {
      const clStd = cortisolType === CortisolType.TOTAL ? pkParams.werumeus.clTotal : pkParams.werumeus.clFree;
      const vdStd = cortisolType === CortisolType.TOTAL ? pkParams.werumeus.vdTotal : pkParams.werumeus.vdFree;
      
      const cl = clStd * weightFactor;
      const vd = vdStd * weightFactor;
      const ke = cl / vd;
      const tHalf = Math.LN2 / ke; // in hours
      return {
        cl: cl.toFixed(2),
        tHalf: (tHalf * 60).toFixed(1) // in minutes
      };
    } else {
      // Michelet 2020
      let cl = pkParams.michelet.cl * Math.pow(weightFactor, 0.75);
      if (ageDays < 28) cl *= 0.8;
      
      const vc = pkParams.michelet.vc * weightFactor;
      const vp = pkParams.michelet.vp * weightFactor;
      
      const vdTotal = vc + vp;
      const ke_eff = cl / vdTotal;
      const tHalf = Math.LN2 / ke_eff;
      
      return {
        cl: cl.toFixed(1),
        tHalf: (tHalf * 60).toFixed(1)
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
    <div className="min-h-screen bg-white text-[#141414] font-sans selection:bg-[#141414] selection:text-white">
      <header className="border-b border-[#141414] p-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-serif italic tracking-tight">Modelo Ajuste Hidrocortisona</h1>
          <p className="text-xs uppercase tracking-widest opacity-50 mt-1 font-mono">Dose Adaptation Engine v4.1</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-[#141414] text-white px-4 py-2 rounded-sm text-right">
            <span className="text-[9px] font-mono uppercase opacity-50 block">Dosis Total Diaria</span>
            <span className="text-xl font-mono font-bold">{totalDailyDose.toFixed(1)} <span className="text-xs font-normal">mg</span></span>
          </div>
          <div className="bg-[#141414] text-white px-4 py-2 rounded-sm text-right">
            <span className="text-[9px] font-mono uppercase opacity-50 block">Dosis Relativa</span>
            <span className="text-xl font-mono font-bold">{mgPerKgDay.toFixed(3)} <span className="text-xs font-normal">mg/kg/d</span></span>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-[calc(100vh-100px)]">
        {/* Sidebar: Calibration & Pulse Editor */}
        <section className="lg:col-span-3 border-r border-[#141414] p-6 space-y-8 bg-gray-50 overflow-y-auto max-h-[calc(100vh-100px)]">
          <div className="grid grid-cols-2 gap-4">
            <div className="group">
              <label className="text-[9px] font-mono uppercase opacity-50 block mb-1">Peso (kg)</label>
              <input 
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full bg-white border border-[#141414]/10 p-2 font-mono text-sm focus:border-[#141414] outline-none transition-colors"
                placeholder="70"
              />
            </div>
            <div className="group">
              <label className="text-[9px] font-mono uppercase opacity-50 block mb-1">Edad (años)</label>
              <input 
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full bg-white border border-[#141414]/10 p-2 font-mono text-sm focus:border-[#141414] outline-none transition-colors"
                placeholder="10"
              />
            </div>
          </div>

          <div className="pt-6 border-t border-[#141414]/10">
            <div className="flex items-center gap-2 mb-4">
              <Target size={16} className="text-gray-400" />
              <h2 className="text-xs font-mono uppercase tracking-widest font-bold">Perfil Objetivo</h2>
            </div>
            <div className="h-24 bg-white border border-[#141414]/5 rounded p-2 overflow-hidden">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={Array.from({length: 24}, (_, i) => ({time: i*60, val: getTargetAt(i*60)}))}>
                  <Area type="monotone" dataKey="val" stroke="#141414" fill="#141414" fillOpacity={0.1} strokeWidth={1} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[9px] font-mono opacity-50 mt-2 leading-tight">Ritmo circadiano fisiológico ideal (Referencia en gris claro en gráfica principal).</p>
          </div>

          <div className="pt-6 border-t border-[#141414]/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} />
                <h2 className="text-xs font-mono uppercase tracking-widest font-bold">Modelo Farmacocinético</h2>
              </div>
            </div>
            
            <div className="flex gap-1 bg-white border border-[#141414]/10 p-1 rounded-sm mb-4">
              {Object.values(PKModelType).map((model) => (
                <button
                  key={model}
                  onClick={() => setSelectedModel(model)}
                  className={`flex-1 py-1.5 text-[9px] font-mono uppercase tracking-tighter transition-all ${
                    selectedModel === model 
                      ? 'bg-[#141414] text-white' 
                      : 'hover:bg-[#141414]/5 text-[#141414]/50'
                  }`}
                >
                  {model.split(' ')[0]}
                </button>
              ))}
            </div>

            <div className="flex gap-1 bg-white border border-[#141414]/10 p-1 rounded-sm mb-4">
              {Object.values(CortisolType).map((type) => (
                <button
                  key={type}
                  onClick={() => setCortisolType(type)}
                  className={`flex-1 py-1.5 text-[9px] font-mono uppercase tracking-tighter transition-all ${
                    cortisolType === type 
                      ? 'bg-[#141414] text-white' 
                      : 'hover:bg-[#141414]/5 text-[#141414]/50'
                  }`}
                >
                  Cortisol {type}
                </button>
              ))}
            </div>

            <p className="text-[10px] leading-relaxed opacity-70 mb-4 italic">
              {selectedModel === PKModelType.WERUMEUS_BUNING_2017 
                ? `Modelo de un compartimento (Werumeus Buning et al., 2017) para Cortisol ${cortisolType}.`
                : `Modelo de dos compartimentos (Michelet et al., 2020) para Cortisol ${cortisolType} (Binding no lineal).`}
            </p>

            <div className="bg-white border border-[#141414]/10 p-3 rounded-sm space-y-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest">Parámetros</span>
                <button 
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-[9px] font-mono text-blue-600 hover:underline"
                >
                  {showAdvanced ? 'Ocultar' : 'Editar'}
                </button>
              </div>

              {selectedModel === PKModelType.WERUMEUS_BUNING_2017 ? (
                <>
                  {showAdvanced ? (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="space-y-1">
                        <label className="text-[8px] uppercase opacity-50">Ka (h⁻¹)</label>
                        <input 
                          type="number" step="0.1"
                          value={pkParams.werumeus.ka}
                          onChange={(e) => setPkParams({ ...pkParams, werumeus: { ...pkParams.werumeus, ka: parseFloat(e.target.value) || 0 }})}
                          className="w-full text-[10px] font-mono border p-1"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] uppercase opacity-50">CL Total</label>
                        <input 
                          type="number" step="0.1"
                          value={pkParams.werumeus.clTotal}
                          onChange={(e) => setPkParams({ ...pkParams, werumeus: { ...pkParams.werumeus, clTotal: parseFloat(e.target.value) || 0 }})}
                          className="w-full text-[10px] font-mono border p-1"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] uppercase opacity-50">Vd Total</label>
                        <input 
                          type="number" step="0.1"
                          value={pkParams.werumeus.vdTotal}
                          onChange={(e) => setPkParams({ ...pkParams, werumeus: { ...pkParams.werumeus, vdTotal: parseFloat(e.target.value) || 0 }})}
                          className="w-full text-[10px] font-mono border p-1"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] uppercase opacity-50">CL Libre</label>
                        <input 
                          type="number" step="0.1"
                          value={pkParams.werumeus.clFree}
                          onChange={(e) => setPkParams({ ...pkParams, werumeus: { ...pkParams.werumeus, clFree: parseFloat(e.target.value) || 0 }})}
                          className="w-full text-[10px] font-mono border p-1"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-50 uppercase">Ka (Absorción)</span>
                        <span>{pkParams.werumeus.ka.toFixed(2)} h⁻¹</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-50 uppercase">CL (70kg)</span>
                        <span>{cortisolType === CortisolType.TOTAL ? pkParams.werumeus.clTotal : pkParams.werumeus.clFree} L/h</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-50 uppercase">Vd (70kg)</span>
                        <span>{cortisolType === CortisolType.TOTAL ? pkParams.werumeus.vdTotal : pkParams.werumeus.vdFree} L</span>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  {showAdvanced ? (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="space-y-1">
                        <label className="text-[8px] uppercase opacity-50">Vmax Abs</label>
                        <input 
                          type="number"
                          value={pkParams.michelet.vmaxAbs}
                          onChange={(e) => setPkParams({ ...pkParams, michelet: { ...pkParams.michelet, vmaxAbs: parseFloat(e.target.value) || 0 }})}
                          className="w-full text-[10px] font-mono border p-1"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] uppercase opacity-50">Km Abs</label>
                        <input 
                          type="number"
                          value={pkParams.michelet.kmAbs}
                          onChange={(e) => setPkParams({ ...pkParams, michelet: { ...pkParams.michelet, kmAbs: parseFloat(e.target.value) || 0 }})}
                          className="w-full text-[10px] font-mono border p-1"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] uppercase opacity-50">CL/F (70kg)</label>
                        <input 
                          type="number"
                          value={pkParams.michelet.cl}
                          onChange={(e) => setPkParams({ ...pkParams, michelet: { ...pkParams.michelet, cl: parseFloat(e.target.value) || 0 }})}
                          className="w-full text-[10px] font-mono border p-1"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] uppercase opacity-50">Vc/F (70kg)</label>
                        <input 
                          type="number"
                          value={pkParams.michelet.vc}
                          onChange={(e) => setPkParams({ ...pkParams, michelet: { ...pkParams.michelet, vc: parseFloat(e.target.value) || 0 }})}
                          className="w-full text-[10px] font-mono border p-1"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] uppercase opacity-50">Q/F (70kg)</label>
                        <input 
                          type="number"
                          value={pkParams.michelet.q}
                          onChange={(e) => setPkParams({ ...pkParams, michelet: { ...pkParams.michelet, q: parseFloat(e.target.value) || 0 }})}
                          className="w-full text-[10px] font-mono border p-1"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] uppercase opacity-50">Vp/F (70kg)</label>
                        <input 
                          type="number"
                          value={pkParams.michelet.vp}
                          onChange={(e) => setPkParams({ ...pkParams, michelet: { ...pkParams.michelet, vp: parseFloat(e.target.value) || 0 }})}
                          className="w-full text-[10px] font-mono border p-1"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-50 uppercase">Vmax_abs</span>
                        <span>{pkParams.michelet.vmaxAbs.toLocaleString()} nmol/h</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-50 uppercase">Km_abs</span>
                        <span>{pkParams.michelet.kmAbs.toLocaleString()} nmol</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-50 uppercase">CL/F (70kg)</span>
                        <span>{((parseFloat(age) || 10) * 365 < 28 ? pkParams.michelet.cl * 0.8 : pkParams.michelet.cl).toFixed(0)} L/h</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="opacity-50 uppercase">Vc/F (70kg)</span>
                        <span>{pkParams.michelet.vc} L</span>
                      </div>
                    </>
                  )}
                  {cortisolType === CortisolType.TOTAL && (
                    <div className="pt-2 mt-2 border-t border-[#141414]/5 space-y-1">
                      <div className="flex justify-between text-[8px] font-mono opacity-60">
                        <span>CBG (Bmax)</span>
                        <span>580 nmol/L</span>
                      </div>
                      <div className="flex justify-between text-[8px] font-mono opacity-60">
                        <span>Kd (Afinidad)</span>
                        <span>60 nmol/L</span>
                      </div>
                      <div className="flex justify-between text-[8px] font-mono opacity-60">
                        <span>Albúmina (NS)</span>
                        <span>1.5x</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="pt-6 border-t border-[#141414]/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target size={16} />
                <h2 className="text-xs font-mono uppercase tracking-widest font-bold">2. Régimen de Dosis</h2>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setPulses(STANDARD_PULSES)}
                  className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors"
                  title="Restablecer Dosis"
                >
                  <Activity size={14} className="opacity-50" />
                </button>
                <button 
                  onClick={handleOptimize}
                  className="p-2 bg-[#141414] text-white rounded-full hover:scale-110 transition-transform"
                  title="Auto-Optimizar Dosis"
                >
                  <Wand2 size={14} />
                </button>
              </div>
            </div>
            
            <div className="space-y-3">
              {pulses.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-white border border-[#141414]/5 p-2 rounded-sm shadow-sm group">
                  <input 
                    type="time"
                    value={formatTime(p.time)}
                    onChange={(e) => handlePulseTimeChange(i, e.target.value)}
                    className="text-[10px] font-mono font-bold w-20 bg-transparent outline-none focus:text-[#141414]"
                  />
                  <div className="flex items-center gap-1">
                    <button onClick={() => updatePulseDose(i, -0.1)} className="p-1 hover:bg-[#141414]/10 rounded transition-colors"><Minus size={12}/></button>
                    <input 
                      type="number"
                      step="0.1"
                      min="0"
                      value={p.dose}
                      onChange={(e) => handlePulseDoseChange(i, e.target.value)}
                      className="text-xs font-mono w-14 text-center bg-transparent border-b border-transparent focus:border-[#141414] outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button onClick={() => updatePulseDose(i, 0.1)} className="p-1 hover:bg-[#141414]/10 rounded transition-colors"><Plus size={12}/></button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono opacity-40">mg</span>
                    <button 
                      onClick={() => removePulse(i)}
                      className="p-1 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 rounded"
                    >
                      <Plus size={12} className="rotate-45" />
                    </button>
                  </div>
                </div>
              ))}
              
              <button 
                onClick={addPulse}
                className="w-full py-2 border border-dashed border-[#141414]/20 rounded-sm text-[9px] font-mono uppercase tracking-widest opacity-50 hover:opacity-100 hover:border-[#141414]/40 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={12} />
                Añadir Dosis
              </button>
            </div>
          </div>
        </section>

        {/* Main Chart Area */}
        <section className="lg:col-span-9 p-8 flex flex-col bg-white">
          <div className="flex justify-between items-center mb-6 px-4">
            <div className="flex gap-8">
              <div className="border-l-2 border-[#141414] pl-3">
                <span className="text-[9px] font-mono opacity-50 block uppercase tracking-tighter">Aclaramiento (Cl)</span>
                <span className="text-sm font-mono font-bold">{pkStats.cl} <span className="text-[10px] font-normal">L/h</span></span>
              </div>
              <div className="border-l-2 border-[#141414] pl-3">
                <span className="text-[9px] font-mono opacity-50 block uppercase tracking-tighter">Semivida (t½)</span>
                <span className="text-sm font-mono font-bold">{pkStats.tHalf} <span className="text-[10px] font-normal">min</span></span>
              </div>
            </div>
              <div className="text-right">
                <div className="mb-2">
                  <span className="text-[9px] font-mono opacity-50 block uppercase tracking-tighter">Ajuste (SSE)</span>
                  <span className="text-lg font-mono font-bold text-emerald-600">{sseScore.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <span className="text-[9px] font-mono opacity-50 block uppercase tracking-tighter">Periodo de Simulación</span>
                <span className="text-xs font-mono font-bold">00:00 — 23:59</span>
              </div>
          </div>

          <div className="flex-1 min-h-[400px] relative">
            {simulationData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={simulationData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#14141408" />
                  <XAxis 
                    dataKey="time" 
                    tickFormatter={formatTime} 
                    stroke="#141414" 
                    fontSize={10} 
                    fontFamily="monospace"
                    ticks={[0, 180, 360, 540, 720, 900, 1080, 1260, 1440]}
                  />
                  <YAxis stroke="#141414" fontSize={10} fontFamily="monospace" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#141414', border: 'none', color: 'white', fontFamily: 'monospace', fontSize: '10px' }}
                    labelFormatter={(t) => `Hora: ${formatTime(t as number)}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="concentration" 
                    stroke="#141414" 
                    strokeWidth={2.5}
                    fill="#141414"
                    fillOpacity={0.03}
                    name="Niveles Predichos"
                    animationDuration={1000}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="target" 
                    stroke="#141414" 
                    strokeWidth={1.5} 
                    strokeDasharray="6 4" 
                    dot={false}
                    opacity={0.3}
                    name="Objetivo Fisiológico"
                  />
                  <ReferenceLine y={400} stroke="#141414" strokeDasharray="3 3" opacity={0.3} label={{ value: 'Nivel Alto', position: 'right', fontSize: 8, fontFamily: 'monospace' }} />
                  <ReferenceLine x={720} stroke="#141414" strokeDasharray="3 3" opacity={0.1} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center opacity-10 text-center">
                <Calculator size={80} strokeWidth={0.5} />
                <p className="mt-4 font-serif italic text-2xl">Preparado para optimizar...</p>
                <p className="text-[10px] font-mono uppercase tracking-widest mt-2">Ajusta el peso o las dosis para simular</p>
              </div>
            )}
          </div>

          {/* Legend & Stats */}
          <div className="mt-8 flex flex-wrap gap-12 border-t border-[#141414]/10 pt-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-6 h-0.5 bg-[#141414]"></div>
                <span className="text-[10px] font-mono uppercase font-bold">Simulación Actual (nmol/L)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-0.5 bg-[#141414] opacity-30 border-t border-dashed"></div>
                <span className="text-[10px] font-mono uppercase font-bold">Objetivo Fisiológico (Gris Claro)</span>
              </div>
            </div>
            
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-6">
              {peaks.slice(0, 4).map((p, i) => (
                <div key={i} className="border-l-2 border-[#141414] pl-4">
                  <span className="text-[9px] font-mono opacity-50 block uppercase tracking-tighter">Pico {i+1} ({p.time})</span>
                  <span className="text-lg font-mono font-bold">{p.value} <span className="text-[10px] font-normal">nmol/L</span></span>
                </div>
              ))}
            </div>

            {errorScore !== null && (
              <div className="border-l-2 border-[#141414] pl-4">
                <span className="text-[9px] font-mono opacity-50 block uppercase tracking-tighter">Desviación (RMSE)</span>
                <span className="text-lg font-mono font-bold">{errorScore.toFixed(1)}</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
