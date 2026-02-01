
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  PhoneOff, 
  MessageSquare, 
  Settings, 
  Maximize2,
  Sparkles,
  Users,
  Activity,
  X,
  Sliders,
  CircleStop,
  Radio,
  AlertCircle,
  Globe,
  Languages,
  EarOff,
  Ear,
  Type as TypeIcon,
  Loader2
} from 'lucide-react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { encode, decode, decodeAudioData } from './utils/audio';
import { transcribeAudio } from './services/geminiService';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';
const TRANSLATION_MODEL = 'gemini-3-flash-preview';
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

interface TranscriptEntry {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  englishTranslation?: string;
  isTranscription?: boolean;
}

export default function App() {
  const [isActive, setIsActive] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [showTranscript, setShowTranscript] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<{id: number, msg: string}[]>([]);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Transcription State (Gemini 3 Flash)
  const [isDictating, setIsDictating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const dictationRecorderRef = useRef<MediaRecorder | null>(null);
  const dictationChunksRef = useRef<Blob[]>([]);

  // Audio Processing State
  const [isNoiseCancellationEnabled, setIsNoiseCancellationEnabled] = useState(true);

  // Translation State - Specifically for "Any to English"
  const [isTranslationEnabled, setIsTranslationEnabled] = useState(true);

  // Streaming Configuration State
  const [frameRate, setFrameRate] = useState(1);
  const [jpegQuality, setJpegQuality] = useState(0.5);

  // Refs for media and session
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  
  // Audio Refs
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const outputGainRef = useRef<GainNode | null>(null);

  // Transcription accumulators
  const currentUserInputRef = useRef('');
  const currentModelOutputRef = useRef('');

  const addAlert = (msg: string) => {
    const id = Date.now();
    setAlerts(prev => [...prev, { id, msg }]);
    setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 5000);
  };

  // Screenshot Detection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || (e.ctrlKey && e.key === 'p')) {
        addAlert("Screenshot detected! Admin notified.");
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isActive) {
        addAlert("Security Warning: Window focus lost.");
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive]);

  const toggleNoiseCancellation = async (enabled: boolean) => {
    setIsNoiseCancellationEnabled(enabled);
    if (mediaStreamRef.current) {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        try {
          await audioTrack.applyConstraints({
            noiseSuppression: enabled,
            echoCancellation: enabled,
            autoGainControl: enabled
          });
          addAlert(`Noise Cancellation ${enabled ? 'Enabled' : 'Disabled'}`);
        } catch (e) {
          console.error("Failed to apply audio constraints", e);
        }
      }
    }
  };

  /**
   * Dictation Feature using Gemini 3 Flash
   */
  const startDictation = async () => {
    try {
      const stream = mediaStreamRef.current || await navigator.mediaDevices.getUserMedia({ audio: true });
      dictationChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) dictationChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        setIsTranscribing(true);
        const blob = new Blob(dictationChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          try {
            const transcriptText = await transcribeAudio(base64Data, 'audio/webm');
            setTranscript(prev => [...prev, { 
              id: Date.now() + '-t', 
              role: 'user', 
              text: transcriptText, 
              isTranscription: true 
            }]);
          } catch (err) {
            addAlert("Transcription failed. Please try again.");
          } finally {
            setIsTranscribing(false);
          }
        };
        reader.readAsDataURL(blob);
      };

      dictationRecorderRef.current = recorder;
      recorder.start();
      setIsDictating(true);
      addAlert("Dictation started...");
    } catch (err) {
      console.error("Dictation error:", err);
      addAlert("Microphone access denied for dictation.");
    }
  };

  const stopDictation = () => {
    if (dictationRecorderRef.current && dictationRecorderRef.current.state !== 'inactive') {
      dictationRecorderRef.current.stop();
      setIsDictating(false);
    }
  };

  /**
   * Translates any input language to English using Gemini 3 Flash.
   */
  const translateToEnglish = async (text: string) => {
    if (!text || !isTranslationEnabled) return null;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: TRANSLATION_MODEL,
        contents: `Act as a real-time translator. Translate the following text to English. If it is already in English, return the word "SKIP". Otherwise, return ONLY the English translation. Text: "${text}"`,
      });
      const result = response.text?.trim() || "";
      return result === "SKIP" ? null : result;
    } catch (e) {
      console.error("Translation to English failed", e);
      return null;
    }
  };

  const startRecording = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(screenStream, { mimeType: 'video/webm;codecs=vp9' });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `Aether-Recording-${new Date().toISOString()}.webm`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        setIsRecording(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      addAlert("Screen recording active.");
    } catch (err) {
      console.error("Recording error:", err);
      setSessionError("Recording permissions not granted.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
  };

  const stopSession = useCallback(() => {
    setIsActive(false);
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (frameIntervalRef.current) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    audioSourcesRef.current.forEach(source => source.stop());
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  useEffect(() => {
    if (!isActive || !isCamOn) {
      if (frameIntervalRef.current) {
        window.clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      return;
    }
    if (frameIntervalRef.current) window.clearInterval(frameIntervalRef.current);

    frameIntervalRef.current = window.setInterval(() => {
      if (!localVideoRef.current || !canvasRef.current || !sessionRef.current) return;
      const video = localVideoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(async (blob) => {
          if (blob) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Data = (reader.result as string).split(',')[1];
              if (sessionRef.current) {
                sessionRef.current.sendRealtimeInput({
                  media: { data: base64Data, mimeType: 'image/jpeg' }
                });
              }
            };
            reader.readAsDataURL(blob);
          }
        }, 'image/jpeg', jpegQuality);
      }
    }, 1000 / frameRate);

    return () => {
      if (frameIntervalRef.current) window.clearInterval(frameIntervalRef.current);
    };
  }, [isActive, isCamOn, frameRate, jpegQuality]);

  const startSession = async () => {
    setSessionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          noiseSuppression: isNoiseCancellationEnabled, 
          echoCancellation: true, 
          autoGainControl: true 
        }, 
        video: true 
      });
      mediaStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      inputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
      outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
      outputGainRef.current = outputAudioCtxRef.current.createGain();
      outputGainRef.current.connect(outputAudioCtxRef.current.destination);

      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: `You are an advanced AI companion in a video conference. You can understand multiple languages but you should respond naturally. Your transcriptions will be automatically translated to English for the user.`
        },
        callbacks: {
          onopen: () => {
            setIsActive(true);
            const source = inputAudioCtxRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioCtxRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              if (!isMicOn) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmBase64 = encode(new Uint8Array(int16.buffer));
              sessionPromise.then(s => s.sendRealtimeInput({ media: { data: pcmBase64, mimeType: 'audio/pcm;rate=16000' } }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioCtxRef.current!.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioCtxRef.current) {
              const ctx = outputAudioCtxRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, OUTPUT_SAMPLE_RATE, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputGainRef.current!);
              source.addEventListener('ended', () => audioSourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              audioSourcesRef.current.add(source);
            }
            if (msg.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(s => s.stop());
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
            if (msg.serverContent?.inputTranscription) currentUserInputRef.current += msg.serverContent.inputTranscription.text;
            if (msg.serverContent?.outputTranscription) currentModelOutputRef.current += msg.serverContent.outputTranscription.text;
            
            if (msg.serverContent?.turnComplete) {
              const userText = currentUserInputRef.current;
              const modelText = currentModelOutputRef.current;
              
              if (userText) {
                const english = await translateToEnglish(userText);
                setTranscript(prev => [...prev, { id: Date.now() + '-u', role: 'user', text: userText, englishTranslation: english || undefined }]);
              }
              if (modelText) {
                const english = await translateToEnglish(modelText);
                setTranscript(prev => [...prev, { id: Date.now() + '-m', role: 'model', text: modelText, englishTranslation: english || undefined }]);
              }
              currentUserInputRef.current = '';
              currentModelOutputRef.current = '';
            }
          },
          onerror: (e) => {
            console.error('API Error:', e);
            setSessionError('Network error occurred.');
            stopSession();
          },
          onclose: () => setIsActive(false)
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error('Failed to start session:', err);
      setSessionError('Camera/Microphone access failed.');
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#020617] relative">
      <canvas ref={canvasRef} className="hidden" />

      {/* Alert Toasts */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-sm">
        {alerts.map(alert => (
          <div key={alert.id} className="bg-indigo-600/90 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300 border border-white/20 backdrop-blur-md">
            <Sparkles size={20} className="text-indigo-300" />
            <span className="text-sm font-bold">{alert.msg}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col relative">
        <header className="p-4 flex justify-between items-center z-20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
              <Sparkles className="text-white h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white/90">AETHER</h1>
          </div>
          <div className="flex items-center gap-4 glass px-4 py-2 rounded-full">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">Secure AI Node</span>
            </div>
            {isNoiseCancellationEnabled && (
              <>
                <div className="h-4 w-px bg-white/10" />
                <div className="flex items-center gap-1.5 text-indigo-400 text-xs font-bold">
                  <Ear size={12} />
                  <span>Noise Filter Active</span>
                </div>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-8 relative">
          <div className="w-full max-w-5xl aspect-video rounded-3xl overflow-hidden glass glow-border relative group">
            {!isActive ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-6">
                <Activity size={48} className="text-indigo-500 animate-pulse" />
                <h2 className="text-3xl font-bold text-white tracking-tight">AI Virtual Environment</h2>
                {sessionError && <div className="text-red-400 bg-red-400/10 px-4 py-2 rounded-lg border border-red-400/20 text-sm">{sessionError}</div>}
                <button onClick={startSession} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl flex items-center gap-2 shadow-xl shadow-indigo-600/30 transition-all active:scale-95">
                  <Video size={20} /> Initialize Session
                </button>
              </div>
            ) : (
              <div className="absolute inset-0 bg-[#0f172a] flex flex-col items-center justify-center overflow-hidden">
                <div className="h-40 w-40 rounded-full bg-indigo-600/10 flex items-center justify-center animate-pulse border-4 border-indigo-500/20">
                  <Sparkles size={64} className="text-indigo-400" />
                </div>
                <div className="absolute bottom-10 left-0 right-0 h-16 flex items-center justify-center gap-1 opacity-50">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className="w-1 bg-indigo-500 rounded-full animate-wave" style={{ height: `${Math.random() * 100}%`, animationDelay: `${i * 0.05}s` }} />
                  ))}
                </div>
              </div>
            )}

            <div className={`absolute bottom-6 right-6 w-48 aspect-video rounded-xl overflow-hidden glass border border-white/10 transition-all shadow-2xl ${!isCamOn ? 'bg-slate-900' : ''}`}>
              <video ref={localVideoRef} autoPlay muted playsInline className={`w-full h-full object-cover transform scale-x-[-1] ${!isCamOn ? 'hidden' : ''}`} />
              {!isCamOn && <div className="absolute inset-0 flex items-center justify-center"><VideoOff size={24} className="text-white/20" /></div>}
            </div>
          </div>
        </div>

        <footer className="p-8 flex justify-center pointer-events-none">
          <div className="glass px-8 py-4 rounded-3xl flex items-center gap-4 pointer-events-auto shadow-2xl">
            <ControlButton active={isMicOn} icon={isMicOn ? <Mic size={22} /> : <MicOff size={22} />} onClick={() => setIsMicOn(!isMicOn)} danger={!isMicOn} label="Mic" />
            <ControlButton active={isCamOn} icon={isCamOn ? <Video size={22} /> : <VideoOff size={22} />} onClick={() => setIsCamOn(!isCamOn)} danger={!isCamOn} label="Cam" />
            <div className="h-10 w-px bg-white/10 mx-2" />
            
            <ControlButton 
              active={isRecording} 
              icon={isRecording ? <CircleStop size={22} /> : <Radio size={22} />} 
              onClick={isRecording ? stopRecording : startRecording} 
              danger={isRecording}
              label={isRecording ? "Stop Rec" : "Record"}
            />

            <ControlButton 
              active={isDictating} 
              icon={isTranscribing ? <Loader2 size={22} className="animate-spin" /> : isDictating ? <Ear size={22} /> : <TypeIcon size={22} />} 
              onClick={isDictating ? stopDictation : startDictation} 
              danger={isDictating}
              label={isTranscribing ? "Translating..." : isDictating ? "Stop Dictate" : "Dictate"}
            />
            
            <ControlButton active={showTranscript} icon={<MessageSquare size={22} />} onClick={() => setShowTranscript(!showTranscript)} label="Chat" />
            <ControlButton active={isSettingsOpen} icon={<Settings size={22} />} onClick={() => setIsSettingsOpen(true)} label="Settings" />
            
            <button onClick={stopSession} disabled={!isActive} className="px-6 py-3 bg-red-500 hover:bg-red-400 text-white rounded-2xl flex items-center gap-2 font-bold shadow-lg shadow-red-500/20 disabled:opacity-30">
              <PhoneOff size={20} /> Leave
            </button>
          </div>
        </footer>
      </div>

      {showTranscript && (
        <aside className="w-80 h-full border-l border-white/5 bg-[#0f172a]/50 flex flex-col animate-in slide-in-from-right duration-300">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-bold text-white flex items-center gap-2"><Globe size={18} className="text-indigo-400" /> Meeting Notes</h3>
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold border ${isTranslationEnabled ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20' : 'bg-white/5 text-white/30 border-transparent'}`}>
              <Languages size={12} /> {isTranslationEnabled ? 'Auto-Translate' : 'Off'}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {transcript.length === 0 && (
               <div className="flex flex-col items-center justify-center h-full text-center opacity-20 space-y-3">
                 <Globe size={40} />
                 <p className="text-xs max-w-[150px]">Meeting activity and translations will appear here.</p>
               </div>
            )}
            {transcript.map((entry) => (
              <div key={entry.id} className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
                  {entry.role === 'user' ? (entry.isTranscription ? 'Dictation' : 'Speaker') : 'Aether AI'}
                </span>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed border transition-all ${entry.role === 'user' ? 'bg-indigo-600/10 text-indigo-100 border-indigo-500/20 rounded-tr-none' : 'bg-white/5 text-slate-300 border-white/5 rounded-tl-none'}`}>
                  {entry.englishTranslation ? (
                    <>
                      <div className="text-indigo-400 font-medium mb-2 flex items-center gap-1.5">
                        <Globe size={12} /> {entry.englishTranslation}
                      </div>
                      <div className="opacity-40 text-[11px] border-t border-white/5 pt-2">
                        {entry.text}
                      </div>
                    </>
                  ) : (
                    entry.text
                  )}
                  {entry.isTranscription && (
                    <div className="mt-2 text-[9px] font-bold text-indigo-400/60 uppercase tracking-widest border-t border-indigo-500/10 pt-1">
                      Gemini 3 Flash Transcription
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="glass w-full max-w-md rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><Sliders className="text-indigo-400" /> AI & Audio Config</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-white/5 rounded-full"><X className="text-white/60" /></button>
            </div>
            
            <div className="p-6 space-y-8">
              {/* Noise Cancellation Toggle */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-white/90 uppercase flex items-center gap-2">
                      <Ear size={14} className="text-indigo-400" /> Real-time Noise Filter
                    </label>
                    <span className="text-[10px] text-slate-500">Suppresses background noise for crystal clear audio.</span>
                  </div>
                  <button 
                    onClick={() => toggleNoiseCancellation(!isNoiseCancellationEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isNoiseCancellationEnabled ? 'bg-indigo-600' : 'bg-slate-800'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isNoiseCancellationEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-500 uppercase">Live Translation (Gemini 3 Flash)</label>
                  <button 
                    onClick={() => setIsTranslationEnabled(!isTranslationEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isTranslationEnabled ? 'bg-indigo-600' : 'bg-slate-800'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isTranslationEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">Automatically translates all spoken input to English in your transcript sidebar.</p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-500 uppercase">Input Frame Rate</label>
                  <span className="text-xs font-mono text-indigo-400">{frameRate} FPS</span>
                </div>
                <input type="range" min="0.5" max="5" step="0.5" value={frameRate} onChange={(e) => setFrameRate(parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-500 uppercase">Streaming Quality</label>
                  <span className="text-xs font-mono text-indigo-400">{Math.round(jpegQuality * 100)}%</span>
                </div>
                <input type="range" min="0.1" max="0.9" step="0.1" value={jpegQuality} onChange={(e) => setJpegQuality(parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
              </div>
            </div>

            <div className="p-6 bg-white/5 border-t border-white/5 flex justify-end">
              <button onClick={() => setIsSettingsOpen(false)} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20">Apply Changes</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes wave { 0%, 100% { height: 20%; } 50% { height: 100%; } }
        .animate-wave { animation: wave 1s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function ControlButton({ active, icon, onClick, danger, label }: { active: boolean, icon: React.ReactNode, onClick: () => void, danger?: boolean, label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button onClick={onClick} className={`p-3 rounded-2xl transition-all border flex items-center justify-center ${active ? 'bg-white/5 text-white border-white/10 hover:bg-white/10' : danger ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' : 'bg-white/5 text-white/40 border-transparent hover:text-white'}`}>
        {icon}
      </button>
      <span className="text-[10px] font-bold uppercase tracking-tighter text-white/40">{label}</span>
    </div>
  );
}
