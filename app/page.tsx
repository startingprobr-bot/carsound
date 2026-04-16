'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2, Play, Music, History,
  ListMusic, Trash2, Download, Plus, Pause, Square, Upload,
  Mic2, Zap, Clock, X, Check, Timer, Headphones, Save, FolderOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast, Toaster } from 'sonner';
import { base64ToPcm, pcmToMp3, pcmToWav } from '@/lib/audio-converter';
import { SOUND_EFFECTS, playEffect } from '@/lib/sound-effects';
import { type TimelineItem, mixAudio, audioBufferToWav } from '@/lib/audio-mixer';

// --- Types ---
interface Conversion {
  id: string;
  text: string;
  voice: string;
  speed: number;
  timestamp: number;
  audioUrl?: string;
  blob?: Blob;
  base64?: string;
}

interface Playlist {
  id: string;
  name: string;
  items: string[];
}

interface TimelineTemplate {
  id: string;
  name: string;
  items: TimelineItem[];
  bgMusicVolume: number;
}

interface SavedMusic {
  name: string;
  url: string;
}

const VOICES: { name: string; label: string; gender: 'M' | 'F'; desc?: string }[] = [
  // Masculinas
  { name: 'Charon', label: 'Charon', gender: 'M', desc: 'Grave' },
  { name: 'Fenrir', label: 'Fenrir', gender: 'M', desc: 'Grave' },
  { name: 'Orus', label: 'Orus', gender: 'M' },
  { name: 'Puck', label: 'Puck', gender: 'M' },
  { name: 'Enceladus', label: 'Enceladus', gender: 'M', desc: 'Grave' },
  { name: 'Iapetus', label: 'Iapetus', gender: 'M' },
  { name: 'Umbriel', label: 'Umbriel', gender: 'M' },
  { name: 'Rasalgethi', label: 'Rasalgethi', gender: 'M', desc: 'Grave' },
  { name: 'Alnilam', label: 'Alnilam', gender: 'M' },
  { name: 'Schedar', label: 'Schedar', gender: 'M' },
  { name: 'Gacrux', label: 'Gacrux', gender: 'M' },
  // Femininas
  { name: 'Kore', label: 'Kore', gender: 'F' },
  { name: 'Zephyr', label: 'Zephyr', gender: 'F' },
  { name: 'Aoede', label: 'Aoede', gender: 'F' },
  { name: 'Leda', label: 'Leda', gender: 'F' },
  { name: 'Algieba', label: 'Algieba', gender: 'F' },
  { name: 'Callirrhoe', label: 'Callirrhoe', gender: 'F' },
  { name: 'Autonoe', label: 'Autonoe', gender: 'F' },
  { name: 'Achernar', label: 'Achernar', gender: 'F' },
  { name: 'Laomedeia', label: 'Laomedeia', gender: 'F' },
];

const TTS_STYLES = [
  { id: 'entusiasmado', label: '🔥 Entusiasmado', desc: 'Energético e animado' },
  { id: 'criativo', label: '🎭 Criativo', desc: 'Variado e expressivo' },
  { id: 'urgente', label: '⚡ Urgente', desc: 'Promoção imperdível' },
  { id: 'amigavel', label: '😊 Amigável', desc: 'Simpático e acolhedor' },
  { id: 'serio', label: '🎯 Profissional', desc: 'Sério e formal' },
  { id: 'neutro', label: '🗣️ Neutro', desc: 'Claro e natural' },
];

export default function SoundTruckTTS() {
  // --- Hydration guard ---
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // --- Core State ---
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('Kore');
  const [speed, setSpeed] = useState(1.0);
  const [isConverting, setIsConverting] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [ttsStyle, setTtsStyle] = useState('entusiasmado');
  const [history, setHistory] = useState<Conversion[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<string | null>(null);

  // --- Background Music State ---
  const [savedMusics, setSavedMusics] = useState<SavedMusic[]>([]);
  const [selectedMusic, setSelectedMusic] = useState<string | null>(null);
  const [bgMusicVolume, setBgMusicVolume] = useState(0.3);
  const [bgMusicStartTime, setBgMusicStartTime] = useState(0);
  const [bgMusicTrimStart, setBgMusicTrimStart] = useState(0);
  const [bgMusicEndTime, setBgMusicEndTime] = useState<number | null>(null);
  const [isUploadingMusic, setIsUploadingMusic] = useState(false);

  // --- Timeline ---
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [showAddTimeline, setShowAddTimeline] = useState(false);
  const [lastGeneratedPcm, setLastGeneratedPcm] = useState<Int16Array | null>(null);
  const [lastGeneratedBase64, setLastGeneratedBase64] = useState<string | null>(null);
  const [ttsStartTime, setTtsStartTime] = useState(0);
  const [ttsTrimStart, setTtsTrimStart] = useState(0);
  const [ttsTrimEnd, setTtsTrimEnd] = useState<number | null>(null);

  // --- Timeline Playhead ---
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playStartRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const timelineBarRef = useRef<HTMLDivElement | null>(null);
  const isPlayingRef = useRef(false);
  const playheadRef = useRef(0);

  // --- Timeline Drag ---
  const [draggingItem, setDraggingItem] = useState<string | null>(null);

  // --- Templates ---
  const [templates, setTemplates] = useState<TimelineTemplate[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  // --- Playlist UI ---
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);

  // --- Voice dropdown ---
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const voiceDropdownRef = useRef<HTMLDivElement | null>(null);

  // --- Audio Refs ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const bgSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgGainRef = useRef<GainNode | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const mixSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const mixedBufferRef = useRef<AudioBuffer | null>(null);

  // --- Editing timeline items ---
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'time' | 'volume' | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // ============================================================
  // INITIALIZATION
  // ============================================================
  useEffect(() => {
    loadData();
    loadMusics();
  }, []);

  // Keep bgMusic gain in sync with volume slider
  useEffect(() => {
    if (bgGainRef.current) {
      bgGainRef.current.gain.value = bgMusicVolume;
    }
  }, [bgMusicVolume]);

  // Close voice dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (voiceDropdownRef.current && !voiceDropdownRef.current.contains(e.target as Node)) {
        setShowVoiceDropdown(false);
      }
    };
    if (showVoiceDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showVoiceDropdown]);

  // Spacebar toggle play/pause (refs updated below after function definitions)
  const playMixRef = useRef<() => void>(() => {});
  const pauseMixRef = useRef<() => void>(() => {});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (isPlayingRef.current) {
        pauseMixRef.current();
      } else {
        playMixRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const initAudioContext = () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  // ============================================================
  // DATA PERSISTENCE
  // ============================================================
  const loadData = async () => {
    try {
      const [historyRes, playlistRes, templatesRes] = await Promise.all([
        fetch('/api/data?type=history'),
        fetch('/api/data?type=playlists'),
        fetch('/api/data?type=templates'),
      ]);
      const hData = await historyRes.json();
      setHistory(Array.isArray(hData) ? hData : []);
      const pData = await playlistRes.json();
      setPlaylists(Array.isArray(pData) ? pData : []);
      const tData = await templatesRes.json();
      setTemplates(Array.isArray(tData) ? tData : []);
    } catch (error) {
      console.error('Failed to load data', error);
    }
  };

  const loadMusics = async () => {
    try {
      const res = await fetch('/api/music');
      const data = await res.json();
      setSavedMusics(Array.isArray(data) ? data : []);
    } catch { }
  };

  const saveData = async (type: 'history' | 'playlists' | 'keywords' | 'templates', data: any) => {
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data }),
      });
    } catch (error) {
      console.error(`Failed to save ${type}`, error);
    }
  };

  // ============================================================
  // VOICE PREVIEW
  // ============================================================
  const previewVoice = async (voiceName: string) => {
    if (previewingVoice) return;
    setPreviewingVoice(voiceName);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Olá! Eu sou a voz do seu carro de som!',
          voice: voiceName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.audio) {
        const pcm = base64ToPcm(data.audio);
        const ctx = initAudioContext();
        const buffer = ctx.createBuffer(1, pcm.length, 24000);
        const ch = buffer.getChannelData(0);
        for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768.0;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
        source.onended = () => setPreviewingVoice(null);
      } else {
        toast.error(data.error || 'Erro no preview');
        setPreviewingVoice(null);
      }
    } catch {
      toast.error('Erro ao gerar preview');
      setPreviewingVoice(null);
    }
  };

  // ============================================================
  // TTS CONVERSION
  // ============================================================
  const playPcm = (pcm: Int16Array, spd: number = speed): Promise<void> => {
    return new Promise((resolve) => {
      const ctx = initAudioContext();
      const buffer = ctx.createBuffer(1, pcm.length, 24000);
      const ch = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768.0;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = spd;
      source.connect(ctx.destination);
      source.onended = () => resolve();
      currentSourceRef.current = source;
      source.start();
    });
  };

  const handleConvert = async () => {
    if (!text.trim()) {
      toast.error('Digite algum texto para converter');
      return;
    }

    setIsConverting(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, style: ttsStyle }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erro ao converter áudio');
        return;
      }

      const base64Audio: string = data.audio;
      const pcm = base64ToPcm(base64Audio);

      setLastGeneratedPcm(pcm);
      setLastGeneratedBase64(base64Audio);
      setTtsTrimStart(0);
      setTtsTrimEnd(null);

      // Play the audio
      await playPcm(pcm);

      // Save to history
      const mp3Blob = await pcmToMp3(pcm, 24000);
      const newConversion: Conversion = {
        id: Date.now().toString(),
        text,
        voice,
        speed,
        timestamp: Date.now(),
        blob: mp3Blob,
        base64: base64Audio,
      };

      const updatedHistory = [newConversion, ...history];
      setHistory(updatedHistory);
      saveData('history', updatedHistory.map(({ blob, audioUrl, ...rest }) => rest));

      toast.success('Áudio gerado com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao converter áudio');
    } finally {
      setIsConverting(false);
    }
  };

  const importVoiceFile = async (file: File) => {
    try {
      const ctx = initAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Convert to mono 24kHz Int16 PCM (same format as TTS output)
      const sourceSr = audioBuffer.sampleRate;
      const sourceData = audioBuffer.getChannelData(0);
      const targetSr = 24000;
      const ratio = sourceSr / targetSr;
      const targetLength = Math.floor(sourceData.length / ratio);
      const pcm = new Int16Array(targetLength);

      for (let i = 0; i < targetLength; i++) {
        const srcIdx = Math.floor(i * ratio);
        const sample = Math.max(-1, Math.min(1, sourceData[srcIdx]));
        pcm[i] = sample < 0 ? sample * 32768 : sample * 32767;
      }

      setLastGeneratedPcm(pcm);
      setLastGeneratedBase64(null);
      setTtsTrimStart(0);
      setTtsTrimEnd(null);
      mixedBufferRef.current = null;

      toast.success(`"${file.name}" importado como locução!`);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao importar áudio. Verifique o formato do arquivo.');
    }
  };

  // ============================================================
  // BACKGROUND MUSIC
  // ============================================================
  const handleMusicUpload = async (file: File) => {
    setIsUploadingMusic(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/music', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        await loadMusics();
        setSelectedMusic(data.url);
        toast.success(`"${data.name}" adicionada à biblioteca!`);
      } else {
        toast.error(data.error || 'Erro no upload');
      }
    } catch {
      toast.error('Erro ao enviar música');
    } finally {
      setIsUploadingMusic(false);
    }
  };

  const playBgMusic = async () => {
    if (!selectedMusic) { toast.error('Selecione uma música'); return; }
    const ctx = initAudioContext();
    try {
      stopBgMusic();
      const res = await fetch(selectedMusic);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = bgMusicVolume;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      bgSourceRef.current = source;
      bgGainRef.current = gain;
    } catch {
      toast.error('Erro ao reproduzir música');
    }
  };

  const stopBgMusic = () => {
    try { bgSourceRef.current?.stop(); } catch { }
    bgSourceRef.current = null;
    bgGainRef.current = null;
  };

  const deleteMusic = async (name: string) => {
    try {
      await fetch('/api/music', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await loadMusics();
      if (selectedMusic?.includes(encodeURIComponent(name))) {
        setSelectedMusic(null);
      }
      toast.success('Música removida');
    } catch { }
  };

  // ============================================================
  // HISTORY & DOWNLOAD
  // ============================================================
  const playHistoryItem = async (item: Conversion) => {
    if (item.base64) {
      const pcm = base64ToPcm(item.base64);
      await playPcm(pcm, item.speed);
    } else {
      toast.error('Áudio não disponível');
    }
  };

  const downloadAudio = async (conversion: Conversion) => {
    let blob = conversion.blob;
    if (!blob && conversion.base64) {
      const pcm = base64ToPcm(conversion.base64);
      blob = await pcmToMp3(pcm, 24000);
    }
    if (!blob) { toast.error('Áudio não disponível'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = blob.type.includes('mp3') ? 'mp3' : 'wav';
    a.download = `carro-som-${conversion.id}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteHistoryItem = (id: string) => {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    saveData('history', updated.map(({ blob, audioUrl, ...rest }) => rest));
  };

  // ============================================================
  // TIMELINE MANAGEMENT
  // ============================================================
  const ttsFullDuration = lastGeneratedPcm ? (lastGeneratedPcm.length / 24000 / speed) : 0;
  const ttsDuration = (ttsTrimEnd ?? ttsFullDuration) - ttsTrimStart;
  const ttsEndTime = ttsStartTime + ttsDuration;

  const [tlEffectId, setTlEffectId] = useState(SOUND_EFFECTS[0].id);
  const [tlTime, setTlTime] = useState('0');
  const [tlVolume, setTlVolume] = useState(0.8);

  const addTimelineEffect = () => {
    const effect = SOUND_EFFECTS.find(e => e.id === tlEffectId);
    if (!effect) return;
    const item: TimelineItem = {
      id: Date.now().toString(),
      type: 'effect',
      sourceId: tlEffectId,
      name: effect.name,
      startTime: parseFloat(tlTime) || 0,
      volume: tlVolume,
    };
    setTimelineItems(prev => [...prev, item].sort((a, b) => a.startTime - b.startTime));
    mixedBufferRef.current = null; // invalidate cache
    setShowAddTimeline(false);
  };

  const removeTimelineItem = (id: string) => {
    setTimelineItems(prev => prev.filter(i => i.id !== id));
    mixedBufferRef.current = null;
  };

  const previewTimelineEffect = (effectId: string) => {
    const ctx = initAudioContext();
    playEffect(ctx, effectId);
  };

  // --- Drag to reposition timeline items ---
  const bgMusicEnd = bgMusicEndTime ?? (selectedMusic ? bgMusicStartTime + 30 : 0);
  const mixRealDuration = mixedBufferRef.current?.duration ?? 0;
  const totalTimelineDuration = Math.max(
    ttsEndTime,
    bgMusicEnd,
    bgMusicStartTime + 5,
    mixRealDuration,
    ...timelineItems.map(i => i.startTime + 2),
    1
  );

  const handleTimelineDragStart = (e: React.PointerEvent, itemId: string) => {
    e.preventDefault();
    setDraggingItem(itemId);
    const el = timelineBarRef.current;
    if (!el) return;

    const onMove = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(ev.clientX - rect.left, rect.width));
      const pct = x / rect.width;
      const newTime = Math.round(pct * totalTimelineDuration * 2) / 2; // snap to 0.5s
      setTimelineItems(prev =>
        prev.map(i => i.id === itemId ? { ...i, startTime: Math.max(0, newTime) } : i)
          .sort((a, b) => a.startTime - b.startTime)
      );
    };
    const onUp = () => {
      setDraggingItem(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // --- Templates ---
  const saveTemplate = () => {
    if (!newTemplateName.trim()) return;
    const tpl: TimelineTemplate = {
      id: Date.now().toString(),
      name: newTemplateName.trim(),
      items: timelineItems,
      bgMusicVolume,
    };
    const updated = [...templates, tpl];
    setTemplates(updated);
    saveData('templates', updated);
    setNewTemplateName('');
    setShowSaveTemplate(false);
    toast.success(`Template "${tpl.name}" salvo!`);
  };

  const loadTemplate = (tpl: TimelineTemplate) => {
    setTimelineItems(tpl.items.map(i => ({ ...i, id: Date.now().toString() + Math.random() })));
    setBgMusicVolume(tpl.bgMusicVolume);
    toast.success(`Template "${tpl.name}" carregado!`);
  };

  const deleteTemplate = (id: string) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    saveData('templates', updated);
    toast.success('Template removido');
  };

  // ============================================================
  // EXPORT WITH MIX
  // ============================================================
  const [isMixing, setIsMixing] = useState(false);

  const exportMix = async () => {
    if (!lastGeneratedPcm) {
      toast.error('Gere um áudio primeiro');
      return;
    }
    setIsMixing(true);
    try {
      const ctx = initAudioContext();
      const mixed = await mixAudio(
        ctx,
        lastGeneratedPcm,
        24000,
        speed,
        timelineItems,
        selectedMusic,
        bgMusicVolume,
        ttsStartTime,
        bgMusicStartTime,
        bgMusicEndTime,
        bgMusicTrimStart,
        ttsTrimStart,
        ttsTrimEnd,
      );
      const blob = audioBufferToWav(mixed);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mixagem-carro-som-${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Mixagem exportada!');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao mixar áudio');
    } finally {
      setIsMixing(false);
    }
  };

  // Play the full mix in browser (supports resume from playheadTime)

  const playMix = async () => {
    if (!lastGeneratedPcm) {
      toast.error('Gere um áudio primeiro');
      return;
    }

    const ctx = initAudioContext();
    let mixed = mixedBufferRef.current;

    // Only re-render if we don't have a cached buffer or playhead is at 0
    if (!mixed || playheadRef.current === 0) {
      setIsMixing(true);
      try {
        mixed = await mixAudio(
          ctx,
          lastGeneratedPcm,
          24000,
          speed,
          timelineItems,
          selectedMusic,
          bgMusicVolume,
          ttsStartTime,
          bgMusicStartTime,
          bgMusicEndTime,
          bgMusicTrimStart,
          ttsTrimStart,
          ttsTrimEnd,
        );
        mixedBufferRef.current = mixed;
      } catch {
        toast.error('Erro ao reproduzir mixagem');
        setIsMixing(false);
        return;
      }
    }

    setIsPlaying(true);
    isPlayingRef.current = true;
    setIsMixing(false);

    try {
      const source = ctx.createBufferSource();
      source.buffer = mixed;
      source.connect(ctx.destination);
      mixSourceRef.current = source;

      const mixDuration = mixed.duration;
      const resumeFrom = playheadRef.current;
      playStartRef.current = ctx.currentTime - resumeFrom;

      const tick = () => {
        if (!isPlayingRef.current) return;
        const elapsed = ctx.currentTime - playStartRef.current;
        if (elapsed < mixDuration) {
          setPlayheadTime(elapsed);
          playheadRef.current = elapsed;
          animFrameRef.current = requestAnimationFrame(tick);
        } else {
          setPlayheadTime(0);
          playheadRef.current = 0;
          setIsPlaying(false);
          isPlayingRef.current = false;
          mixedBufferRef.current = null;
        }
      };
      animFrameRef.current = requestAnimationFrame(tick);

      source.start(0, resumeFrom);
      source.onended = () => {
        cancelAnimationFrame(animFrameRef.current);
        mixSourceRef.current = null;
        // If paused, don't reset (playheadRef.current > 0)
        if (playheadRef.current <= 0 || !isPlayingRef.current) {
          // Natural end or stopped
        }
        setIsMixing(false);
      };
    } catch {
      toast.error('Erro ao reproduzir mixagem');
      setIsMixing(false);
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  };

  const pauseMix = () => {
    isPlayingRef.current = false;
    try { mixSourceRef.current?.stop(); } catch {}
    mixSourceRef.current = null;
    cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false);
    setIsMixing(false);
    // playheadRef.current keeps its value for resume
  };

  const stopMix = () => {
    isPlayingRef.current = false;
    try { mixSourceRef.current?.stop(); } catch {}
    mixSourceRef.current = null;
    cancelAnimationFrame(animFrameRef.current);
    setPlayheadTime(0);
    playheadRef.current = 0;
    setIsPlaying(false);
    setIsMixing(false);
    mixedBufferRef.current = null;
  };

  // Keep spacebar refs up to date
  playMixRef.current = playMix;
  pauseMixRef.current = pauseMix;

  const downloadTtsAudio = () => {
    if (!lastGeneratedPcm) {
      toast.error('Gere um áudio primeiro');
      return;
    }
    const blob = pcmToWav(lastGeneratedPcm, 24000);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `locucao-${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Locução baixada!');
  };

  // Compute effect layers for overlapping effects
  const computeEffectLayers = (): Map<string, number> => {
    const EFFECT_DURATION = 2;
    const sorted = [...timelineItems].sort((a, b) => a.startTime - b.startTime);
    const layers = new Map<string, number>();
    const layerEnds: number[] = [];
    for (const item of sorted) {
      let assigned = false;
      for (let l = 0; l < layerEnds.length; l++) {
        if (item.startTime >= layerEnds[l]) {
          layers.set(item.id, l);
          layerEnds[l] = item.startTime + EFFECT_DURATION;
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        layers.set(item.id, layerEnds.length);
        layerEnds.push(item.startTime + EFFECT_DURATION);
      }
    }
    return layers;
  };

  const effectLayers = computeEffectLayers();
  const numEffectLayers = Math.max(1, ...Array.from(effectLayers.values()).map(l => l + 1));

  const updateTimelineItem = (id: string, field: 'startTime' | 'volume', value: number) => {
    setTimelineItems(prev =>
      prev.map(i => i.id === id ? { ...i, [field]: value } : i)
        .sort((a, b) => a.startTime - b.startTime)
    );
  };

  // ============================================================
  // PLAYLISTS
  // ============================================================
  const createPlaylist = () => {
    if (!newPlaylistName.trim()) return;
    const newPl: Playlist = { id: Date.now().toString(), name: newPlaylistName.trim().toUpperCase(), items: [] };
    const updated = [...playlists, newPl];
    setPlaylists(updated);
    saveData('playlists', updated);
    setNewPlaylistName('');
    setShowNewPlaylist(false);
    toast.success(`Playlist "${newPl.name}" criada!`);
  };

  const deletePlaylist = (id: string) => {
    const updated = playlists.filter(p => p.id !== id);
    setPlaylists(updated);
    saveData('playlists', updated);
    if (activePlaylist === id) setActivePlaylist(null);
  };

  const addToPlaylist = (playlistId: string, conversionId: string) => {
    const updated = playlists.map(p =>
      p.id === playlistId && !p.items.includes(conversionId)
        ? { ...p, items: [...p.items, conversionId] }
        : p
    );
    setPlaylists(updated);
    saveData('playlists', updated);
    toast.success('Adicionado!');
  };

  const removeFromPlaylist = (playlistId: string, conversionId: string) => {
    const updated = playlists.map(p =>
      p.id === playlistId ? { ...p, items: p.items.filter(i => i !== conversionId) } : p
    );
    setPlaylists(updated);
    saveData('playlists', updated);
  };

  const playPlaylist = async (playlistId: string) => {
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl || pl.items.length === 0) return;
    setActivePlaylist(playlistId);
    for (const itemId of pl.items) {
      const item = history.find(h => h.id === itemId);
      if (item?.base64) {
        const pcm = base64ToPcm(item.base64);
        await playPcm(pcm, 1.0);
      }
    }
    setActivePlaylist(null);
    toast.success('Playlist finalizada!');
  };

  // ============================================================
  // HELPERS
  // ============================================================
  const formatTimecode = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  };

  // ============================================================
  // RENDER
  // ============================================================
  if (!mounted) {
    return (
      <div className="min-h-screen ambient-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500/20 border-t-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen ambient-bg text-white font-sans selection:bg-orange-500/30">
      <Toaster position="top-right" theme="dark" richColors />

      {/* Header */}
      <header className="glass-strong sticky top-0 z-50 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-orange-500 to-orange-700 p-2.5 rounded-xl shadow-lg shadow-orange-900/30">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">VOZ DO POVO</h1>
            <p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">Sound Truck Engine v2.0</p>
          </div>
        </div>
        {/* Timecode display */}
        {lastGeneratedPcm && (
          <div className="flex items-center gap-3">
            <div className="glass rounded-xl px-4 py-2 flex items-center gap-3">
              <span className={`font-mono text-sm tracking-wider ${isPlaying ? 'text-red-400 playhead-active' : playheadTime > 0 ? 'text-yellow-400' : 'text-white/40'}`}>
                {formatTimecode(playheadTime)}
              </span>
              <span className="text-white/15">/</span>
              <span className="font-mono text-sm text-white/30 tracking-wider">{formatTimecode(totalTimelineDuration)}</span>
            </div>
            <div className="flex gap-1">
              {isPlaying ? (
                <>
                  <button onClick={pauseMix} className="p-2 glass rounded-lg hover:bg-yellow-500/20 text-yellow-400 interactive" title="Pausar (Espaço)">
                    <Pause className="w-4 h-4" />
                  </button>
                  <button onClick={stopMix} className="p-2 glass rounded-lg hover:bg-red-500/20 text-red-400 interactive" title="Parar">
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                </>
              ) : (
                <button onClick={playMix} disabled={isMixing} className="p-2 glass rounded-lg hover:bg-green-500/20 text-green-400 interactive disabled:text-white/20" title="Reproduzir (Espaço)">
                  {isMixing ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white" /> : <Play className="w-4 h-4 fill-current" />}
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* ======== LEFT COLUMN ======== */}
        <div className="lg:col-span-8 space-y-5">

          {/* === TEXT INPUT === */}
          <section className="glass rounded-2xl p-6 glow-orange">
            <div className="flex items-center gap-2 mb-4">
              <Mic2 className="w-4 h-4 text-orange-400" />
              <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/50">Texto para Locução</h2>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite o anúncio aqui... (ex: ATENÇÃO! OFERTA IMPERDÍVEL NO MERCADO DO POVO!)"
              className="w-full h-36 bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 text-base focus:outline-none focus:border-orange-500/40 focus:bg-white/[0.05] transition-all resize-none placeholder:text-white/15"
            />

            {/* Voice Selection */}
            <div className="mt-4 space-y-3">
              <label className="text-[10px] uppercase tracking-[0.15em] text-white/30 font-bold flex items-center gap-2">
                Voz do Locutor
                <span className="text-white/15 normal-case tracking-normal">(clique no ▶ para ouvir)</span>
              </label>
              {/* Masculinas */}
              <div>
                <span className="text-[9px] text-white/20 uppercase tracking-[0.15em] mb-1.5 block">♂ Masculinas</span>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {VOICES.filter(v => v.gender === 'M').map((v) => (
                    <div key={v.name} className="relative">
                      <button onClick={() => setVoice(v.name)}
                        className={`w-full px-1.5 py-2 rounded-lg text-[10px] font-medium border interactive ${voice === v.name
                          ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 shadow-inner'
                          : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.06] hover:border-white/10'
                          }`}>
                        <span className="block truncate">{v.label}</span>
                        {v.desc && <span className={`text-[8px] ${voice === v.name ? 'text-orange-400/50' : 'text-white/20'}`}>{v.desc}</span>}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); previewVoice(v.name); }}
                        disabled={previewingVoice !== null}
                        className="absolute -top-1 -right-1 bg-black/80 backdrop-blur border border-white/10 rounded-full w-4 h-4 flex items-center justify-center hover:bg-orange-500 hover:border-orange-500/50 interactive"
                        title={`Ouvir ${v.name}`}>
                        {previewingVoice === v.name ? (
                          <div className="animate-spin rounded-full h-2.5 w-2.5 border border-white/20 border-t-white" />
                        ) : (
                          <Play className="w-2 h-2 fill-current" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              {/* Femininas */}
              <div>
                <span className="text-[9px] text-white/20 uppercase tracking-[0.15em] mb-1.5 block">♀ Femininas</span>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {VOICES.filter(v => v.gender === 'F').map((v) => (
                    <div key={v.name} className="relative">
                      <button onClick={() => setVoice(v.name)}
                        className={`w-full px-1.5 py-2 rounded-lg text-[10px] font-medium border interactive ${voice === v.name
                          ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 shadow-inner'
                          : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.06] hover:border-white/10'
                          }`}>
                        <span className="block truncate">{v.label}</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); previewVoice(v.name); }}
                        disabled={previewingVoice !== null}
                        className="absolute -top-1 -right-1 bg-black/80 backdrop-blur border border-white/10 rounded-full w-4 h-4 flex items-center justify-center hover:bg-orange-500 hover:border-orange-500/50 interactive"
                        title={`Ouvir ${v.name}`}>
                        {previewingVoice === v.name ? (
                          <div className="animate-spin rounded-full h-2.5 w-2.5 border border-white/20 border-t-white" />
                        ) : (
                          <Play className="w-2 h-2 fill-current" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              {/* Entonação / Estilo */}
              <div>
                <label className="text-[10px] uppercase tracking-[0.15em] text-white/30 font-bold mb-1.5 block">
                  Entonação da Voz
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {TTS_STYLES.map(s => (
                    <button key={s.id} onClick={() => setTtsStyle(s.id)}
                      className={`px-2 py-2 rounded-lg text-[10px] font-medium border interactive ${
                        ttsStyle === s.id
                          ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                          : 'bg-white/[0.03] border-white/[0.06] text-white/40 hover:bg-white/[0.06]'
                      }`}
                      title={s.desc}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Speed + Generate */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.15em] text-white/30 font-bold flex justify-between">
                  Velocidade <span className="text-white/50">{speed.toFixed(1)}x</span>
                </label>
                <input type="range" min="0.5" max="2.0" step="0.1" value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-orange-500" />
                <div className="flex justify-between text-[9px] text-white/15">
                  <span>Lento</span><span>Rápido</span>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <button onClick={handleConvert} disabled={isConverting}
                  className="flex-1 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 disabled:from-white/5 disabled:to-white/5 disabled:text-white/20 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 interactive shadow-lg shadow-orange-900/20">
                  {isConverting ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white" />
                  ) : (
                    <><Zap className="w-5 h-5 fill-current" />GERAR ÁUDIO</>
                  )}
                </button>
                <div className="relative">
                  <input type="file" accept="audio/*" className="hidden" id="import-voice-file"
                    onChange={(e) => { if (e.target.files?.[0]) { importVoiceFile(e.target.files[0]); e.target.value = ''; } }} />
                  <label htmlFor="import-voice-file" title="Importar áudio de locução existente"
                    className="glass hover:bg-white/[0.06] py-3.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 interactive cursor-pointer">
                    <Upload className="w-5 h-5 text-white/50" />
                  </label>
                </div>
                {lastGeneratedPcm && (
                  <button onClick={downloadTtsAudio} title="Baixar locução sem mixar (economiza tokens)"
                    className="glass hover:bg-white/[0.06] py-3.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 interactive">
                    <Download className="w-5 h-5 text-white/50" />
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* === TIMELINE & EFFECTS EDITOR === */}
          <section className="glass rounded-2xl p-6 glow-green">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-green-400" />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/50">Timeline</h2>
              </div>
              <div className="flex items-center gap-2">
                {lastGeneratedPcm && (
                  <span className="text-[10px] glass rounded-lg px-2.5 py-1 text-white/30 font-mono">
                    TTS {ttsDuration.toFixed(1)}s
                  </span>
                )}
                {(isPlaying || playheadTime > 0) && (
                  <span className={`text-[10px] font-mono rounded-lg px-2.5 py-1 ${isPlaying ? 'bg-red-500/15 text-red-400 playhead-active' : 'bg-yellow-500/15 text-yellow-400'}`}>
                    ⏱ {formatTimecode(playheadTime)}
                  </span>
                )}
              </div>
            </div>

            {!lastGeneratedPcm ? (
              <p className="text-xs text-white/20 text-center py-8">
                Gere um áudio primeiro para montar a timeline de efeitos e música
              </p>
            ) : (
              <>
                {/* Visual Timeline Bar - Draggable */}
                <div ref={timelineBarRef} className="relative bg-black/30 rounded-xl mb-4 border border-white/[0.04] p-3 select-none">
                  {/* Time ruler */}
                  <div className="flex justify-between text-[8px] text-white/20 mb-2 px-1 font-mono">
                    {Array.from({ length: Math.min(Math.ceil(totalTimelineDuration) + 1, 11) }, (_, i) => {
                      const totalSecs = Math.ceil(totalTimelineDuration);
                      const sec = totalSecs <= 10 ? i : Math.round(i * totalSecs / 10);
                      return <span key={i}>{sec}s</span>;
                    })}
                  </div>

                  {/* TTS track - draggable with trim handles */}
                  <div className="relative h-8 mb-1">
                    <div className="absolute inset-y-0 track-tts rounded-lg flex items-center gap-0 touch-none border border-orange-500/20"
                      style={{ left: `${(ttsStartTime / totalTimelineDuration) * 100}%`, width: `${(ttsDuration / totalTimelineDuration) * 100}%` }}>
                      {/* Left trim handle */}
                      <div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-20 flex items-center justify-center hover:bg-orange-400/30 rounded-l"
                        onPointerDown={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          const bar = timelineBarRef.current; if (!bar) return;
                          const startX = e.clientX; const origStart = ttsStartTime; const origTrim = ttsTrimStart;
                          const onMove = (ev: PointerEvent) => {
                            const rect = bar.getBoundingClientRect();
                            const dx = ev.clientX - startX;
                            const dt = (dx / rect.width) * totalTimelineDuration;
                            const maxTrim = (ttsTrimEnd ?? ttsFullDuration) - 0.3;
                            const newStart = Math.max(0, origStart + dt);
                            const newTrim = Math.max(0, Math.min(origTrim + (newStart - origStart), maxTrim));
                            setTtsStartTime(newStart);
                            setTtsTrimStart(newTrim);
                            mixedBufferRef.current = null;
                          };
                          const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
                          window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
                        }}>
                        <div className="w-0.5 h-3 bg-orange-400/60 rounded" />
                      </div>

                      {/* Center drag area */}
                      <div className="flex-1 flex items-center px-3 gap-1 cursor-grab active:cursor-grabbing min-w-0"
                        onPointerDown={(e) => {
                          if ((e.target as HTMLElement).closest('input')) return;
                          e.preventDefault();
                          const bar = timelineBarRef.current; if (!bar) return;
                          const startX = e.clientX; const origStart = ttsStartTime;
                          const onMove = (ev: PointerEvent) => {
                            const rect = bar.getBoundingClientRect();
                            const dx = ev.clientX - startX;
                            const dt = (dx / rect.width) * totalTimelineDuration;
                            setTtsStartTime(Math.max(0, origStart + dt));
                            mixedBufferRef.current = null;
                          };
                          const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
                          window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
                        }}>
                        <span className="text-[9px] text-orange-300 font-bold truncate">🎙️ {ttsTrimStart > 0 ? `✂${ttsTrimStart.toFixed(1)}s ` : ''}({ttsDuration.toFixed(1)}s)</span>
                        <input type="number" min="0" step="0.5" value={ttsStartTime}
                          onChange={(e) => { setTtsStartTime(Math.max(0, parseFloat(e.target.value) || 0)); mixedBufferRef.current = null; }}
                          className="w-12 bg-black/50 border border-orange-500/30 rounded px-1 py-0 text-[8px] text-orange-300 focus:outline-none text-center"
                          title="Posição na timeline (segundos)" />
                      </div>

                      {/* Right trim handle */}
                      <div className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-20 flex items-center justify-center hover:bg-orange-400/30 rounded-r"
                        onPointerDown={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          const bar = timelineBarRef.current; if (!bar) return;
                          const startX = e.clientX; const origEnd = ttsTrimEnd ?? ttsFullDuration;
                          const onMove = (ev: PointerEvent) => {
                            const rect = bar.getBoundingClientRect();
                            const dx = ev.clientX - startX;
                            const dt = (dx / rect.width) * totalTimelineDuration;
                            const newEnd = Math.max(ttsTrimStart + 0.3, Math.min(origEnd + dt, ttsFullDuration));
                            setTtsTrimEnd(newEnd);
                            mixedBufferRef.current = null;
                          };
                          const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
                          window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
                        }}>
                        <div className="w-0.5 h-3 bg-orange-400/60 rounded" />
                      </div>
                    </div>
                  </div>

                  {/* Background music track - integrated controls */}
                  <div className="relative h-8 mb-1">
                    {selectedMusic ? (
                      <div className="absolute inset-y-0 track-music rounded-lg flex items-center gap-0 group/music touch-none border border-blue-500/20"
                        style={{
                          left: `${(bgMusicStartTime / totalTimelineDuration) * 100}%`,
                          width: bgMusicEndTime !== null
                            ? `${((bgMusicEndTime - bgMusicStartTime) / totalTimelineDuration) * 100}%`
                            : `${((totalTimelineDuration - bgMusicStartTime) / totalTimelineDuration) * 100}%`,
                        }}>
                        {/* Left trim handle */}
                        {/* Left trim handle - trims the beginning of the music file */}
                        <div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-20 flex items-center justify-center hover:bg-blue-400/30 rounded-l"
                          onPointerDown={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            const bar = timelineBarRef.current; if (!bar) return;
                            const startX = e.clientX; const origStart = bgMusicStartTime; const origTrim = bgMusicTrimStart;
                            const onMove = (ev: PointerEvent) => {
                              const rect = bar.getBoundingClientRect();
                              const dx = ev.clientX - startX;
                              const dt = (dx / rect.width) * totalTimelineDuration;
                              const endLimit = bgMusicEndTime !== null ? bgMusicEndTime - 0.5 : totalTimelineDuration - 0.5;
                              const newStart = Math.max(0, Math.min(origStart + dt, endLimit));
                              const delta = newStart - origStart;
                              setBgMusicStartTime(newStart);
                              setBgMusicTrimStart(Math.max(0, origTrim + delta));
                              mixedBufferRef.current = null;
                            };
                            const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
                            window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
                          }}>
                          <div className="w-0.5 h-3 bg-blue-400/60 rounded" />
                        </div>

                        {/* Center drag area - moves whole bar */}
                        <div className="flex-1 flex items-center px-3 gap-1 cursor-grab active:cursor-grabbing min-w-0"
                          onPointerDown={(e) => {
                            if ((e.target as HTMLElement).closest('input, button, select')) return;
                            e.preventDefault();
                            const bar = timelineBarRef.current; if (!bar) return;
                            const startX = e.clientX; const origStart = bgMusicStartTime; const origEnd = bgMusicEndTime;
                            const duration = origEnd !== null ? origEnd - origStart : totalTimelineDuration - origStart;
                            const onMove = (ev: PointerEvent) => {
                              const rect = bar.getBoundingClientRect();
                              const dx = ev.clientX - startX;
                              const dt = (dx / rect.width) * totalTimelineDuration;
                              const maxStart = origEnd !== null ? totalTimelineDuration - duration : totalTimelineDuration - 0.5;
                              const newStart = Math.max(0, Math.min(origStart + dt, maxStart));
                              setBgMusicStartTime(newStart);
                              if (origEnd !== null) setBgMusicEndTime(newStart + duration);
                              mixedBufferRef.current = null;
                            };
                            const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
                            window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
                          }}>
                          <span className="text-[9px] text-blue-400/80 truncate">🎵{bgMusicTrimStart > 0 ? ` ✂${bgMusicTrimStart.toFixed(1)}s` : ''}</span>
                          <input type="number" min="0" step="0.5" value={bgMusicStartTime}
                            onChange={(e) => { setBgMusicStartTime(Math.max(0, parseFloat(e.target.value) || 0)); mixedBufferRef.current = null; }}
                            className="w-10 bg-black/50 border border-blue-500/30 rounded px-0.5 py-0 text-[7px] text-blue-300 focus:outline-none text-center"
                            title="Início (s)" />
                          <span className="text-[7px] text-blue-400/40">-</span>
                          <input type="number" min="0" step="0.5" value={bgMusicEndTime ?? ''}
                            placeholder="∞"
                            onChange={(e) => { const v = parseFloat(e.target.value); setBgMusicEndTime(isNaN(v) ? null : Math.max(bgMusicStartTime + 0.5, v)); mixedBufferRef.current = null; }}
                            className="w-10 bg-black/50 border border-blue-500/30 rounded px-0.5 py-0 text-[7px] text-blue-300 focus:outline-none text-center placeholder:text-blue-400/20"
                            title="Fim (s) — vazio = até o final" />
                          <input type="range" min="0" max="3" step="0.05" value={bgMusicVolume}
                            onChange={(e) => { setBgMusicVolume(parseFloat(e.target.value)); mixedBufferRef.current = null; }}
                            className="w-14 accent-blue-500 h-1" title={`Volume: ${Math.round(bgMusicVolume * 100)}%`}
                            style={{ background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(bgMusicVolume / 3) * 100}%, rgba(255,255,255,0.1) ${(bgMusicVolume / 3) * 100}%)` }} />
                          <span className={`text-[8px] w-8 text-right ${bgMusicVolume > 1 ? 'text-yellow-400' : 'text-blue-400/60'}`}>{Math.round(bgMusicVolume * 100)}%</span>
                          <button onClick={() => { setSelectedMusic(null); setBgMusicTrimStart(0); setBgMusicStartTime(0); setBgMusicEndTime(null); mixedBufferRef.current = null; }} className="text-blue-400/40 hover:text-red-400">
                            <X className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Right trim handle */}
                        <div className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-20 flex items-center justify-center hover:bg-blue-400/30 rounded-r"
                          onPointerDown={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            const bar = timelineBarRef.current; if (!bar) return;
                            const startX = e.clientX; const origEnd = bgMusicEndTime ?? totalTimelineDuration;
                            const onMove = (ev: PointerEvent) => {
                              const rect = bar.getBoundingClientRect();
                              const dx = ev.clientX - startX;
                              const dt = (dx / rect.width) * totalTimelineDuration;
                              const newEnd = Math.max(bgMusicStartTime + 0.5, Math.min(origEnd + dt, totalTimelineDuration));
                              setBgMusicEndTime(newEnd); mixedBufferRef.current = null;
                            };
                            const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
                            window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
                          }}>
                          <div className="w-0.5 h-3 bg-blue-400/60 rounded" />
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-y-0 left-0 w-full rounded-lg border border-dashed border-blue-500/10 flex items-center justify-center gap-2 bg-blue-500/[0.03]">
                        {savedMusics.length > 0 ? (
                          <select className="bg-transparent text-[9px] text-blue-400/30 focus:outline-none cursor-pointer"
                            defaultValue="" onChange={(e) => { if (e.target.value) setSelectedMusic(e.target.value); }}>
                            <option value="" disabled>🎵 Selecionar música de fundo...</option>
                            {savedMusics.map(m => <option key={m.name} value={m.url}>{m.name}</option>)}
                          </select>
                        ) : (
                          <span className="text-[9px] text-blue-400/25">🎵 Sem música (faça upload abaixo)</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Music upload inline */}
                  {!selectedMusic && (
                    <div className="mb-1">
                      <input type="file" accept="audio/*" className="hidden" id="bg-music-upload-tl"
                        onChange={(e) => e.target.files?.[0] && handleMusicUpload(e.target.files[0])} />
                      <label htmlFor="bg-music-upload-tl"
                        className="flex items-center justify-center py-1 cursor-pointer text-[9px] text-blue-400/30 hover:text-blue-400/60 transition-all">
                        {isUploadingMusic ? (
                          <div className="animate-spin rounded-full h-3 w-3 border border-white/20 border-t-blue-400" />
                        ) : (
                          <><Plus className="w-3 h-3 mr-1" />Upload música</>
                        )}
                      </label>
                    </div>
                  )}

                  {/* Effects tracks - multiple layers for overlapping effects */}
                  {Array.from({ length: numEffectLayers }, (_, layerIndex) => (
                    <div key={layerIndex} className="relative h-8 mt-1">
                      <div className="absolute inset-y-0 left-0 w-full track-effect rounded-lg border border-green-500/10">
                        {layerIndex === 0 && timelineItems.length === 0 && (
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white/10">
                            Arraste efeitos aqui ou clique + Adicionar
                          </span>
                        )}
                        {timelineItems.filter(item => (effectLayers.get(item.id) ?? 0) === layerIndex).map((item) => {
                          const leftPct = (item.startTime / totalTimelineDuration) * 100;
                          const eff = SOUND_EFFECTS.find(e => e.id === item.sourceId);
                          const isDragging = draggingItem === item.id;
                          return (
                            <div key={item.id}
                              className={`absolute top-0 bottom-0 flex items-center touch-none ${isDragging ? 'z-20' : 'z-10'}`}
                              style={{ left: `${Math.min(leftPct, 92)}%` }}
                              onPointerDown={(e) => handleTimelineDragStart(e, item.id)}
                              title={`${eff?.name} @ ${item.startTime}s (vol ${Math.round(item.volume * 100)}%) — arraste para mover`}
                            >
                              <div className={`rounded-md px-1.5 py-0.5 flex items-center gap-0.5 cursor-grab active:cursor-grabbing interactive ${
                                isDragging
                                  ? 'bg-green-500/30 border-2 border-green-400 scale-110 shadow-lg shadow-green-500/20'
                                  : 'bg-green-500/15 border border-green-500/25 hover:bg-green-500/25'
                              }`}>
                                <span className="text-xs">{eff?.emoji}</span>
                                <span className="text-[8px] text-green-400/70 font-mono">{item.startTime.toFixed(1)}s</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Playhead - draggable when paused */}
                  {(isPlaying || playheadTime > 0) && (
                    <div
                      className={`absolute top-0 bottom-0 w-0.5 z-30 ${isPlaying ? 'bg-red-500 pointer-events-none playhead-active' : 'bg-yellow-400 cursor-ew-resize'}`}
                      style={{ left: `calc(${Math.min((playheadTime / totalTimelineDuration) * 100, 100)}% + 12px)` }}
                      onPointerDown={!isPlaying ? (e) => {
                        e.preventDefault();
                        const bar = timelineBarRef.current;
                        if (!bar) return;
                        const onMove = (ev: PointerEvent) => {
                          const rect = bar.getBoundingClientRect();
                          const x = Math.max(0, Math.min(ev.clientX - rect.left, rect.width));
                          const t = (x / rect.width) * totalTimelineDuration;
                          setPlayheadTime(t);
                          playheadRef.current = t;
                          mixedBufferRef.current = null;
                        };
                        const onUp = () => {
                          window.removeEventListener('pointermove', onMove);
                          window.removeEventListener('pointerup', onUp);
                        };
                        window.addEventListener('pointermove', onMove);
                        window.addEventListener('pointerup', onUp);
                      } : undefined}
                    >
                      <div className={`absolute -top-1 -left-1.5 w-3.5 h-3.5 rounded-full shadow-lg ${isPlaying ? 'bg-red-500 shadow-red-500/30' : 'bg-yellow-400 shadow-yellow-400/30 hover:scale-125 interactive'}`} />
                      {/* Timecode tooltip when paused */}
                      {!isPlaying && playheadTime > 0 && (
                        <div className="absolute -top-7 -left-6 glass rounded px-1.5 py-0.5 text-[8px] font-mono text-yellow-300 whitespace-nowrap pointer-events-none">
                          {formatTimecode(playheadTime)}
                        </div>
                      )}
                    </div>
                  )}


                </div>

                {/* Timeline Items List */}
                <div className="space-y-1 mb-4 max-h-[150px] overflow-y-auto custom-scrollbar">
                  {timelineItems.length === 0 ? (
                    <p className="text-[10px] text-white/15 text-center py-2">Nenhum efeito na timeline — adicione abaixo</p>
                  ) : (
                    timelineItems.map((item) => {
                      const eff = SOUND_EFFECTS.find(e => e.id === item.sourceId);
                      const isEditingTime = editingItemId === item.id && editingField === 'time';
                      const isEditingVol = editingItemId === item.id && editingField === 'volume';
                      return (
                        <div key={item.id} className="flex items-center justify-between glass rounded-lg p-2 group hover:border-green-500/20 interactive">
                          <div className="flex items-center gap-2">
                            <span>{eff?.emoji}</span>
                            <span className="text-xs text-white/80">{eff?.name}</span>
                            {isEditingTime ? (
                              <input type="number" min="0" step="0.5" value={editingValue} autoFocus
                                className="w-16 bg-black border border-green-500/50 rounded px-1.5 py-0.5 text-[9px] text-green-400 focus:outline-none"
                                onChange={(e) => setEditingValue(e.target.value)}
                                onBlur={() => { updateTimelineItem(item.id, 'startTime', parseFloat(editingValue) || 0); setEditingItemId(null); setEditingField(null); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { updateTimelineItem(item.id, 'startTime', parseFloat(editingValue) || 0); setEditingItemId(null); setEditingField(null); } }}
                              />
                            ) : (
                              <button onClick={() => { setEditingItemId(item.id); setEditingField('time'); setEditingValue(item.startTime.toFixed(1)); }}
                                className="text-[9px] bg-green-500/10 text-green-400/60 px-2 py-0.5 rounded hover:bg-green-500/20 cursor-text"
                                title="Clique para editar o tempo">
                                {item.startTime.toFixed(1)}s
                              </button>
                            )}
                            {isEditingVol ? (
                              <input type="range" min="0" max="3" step="0.05" value={editingValue}
                                className="w-20 accent-green-500"
                                onChange={(e) => { setEditingValue(e.target.value); updateTimelineItem(item.id, 'volume', parseFloat(e.target.value)); }}
                                onBlur={() => { setEditingItemId(null); setEditingField(null); }}
                              />
                            ) : (
                              <button onClick={() => { setEditingItemId(item.id); setEditingField('volume'); setEditingValue(String(item.volume)); }}
                                className="text-[9px] text-white/15 hover:text-white/30 cursor-pointer interactive"
                                title="Clique para ajustar volume">
                                🔊 {Math.round(item.volume * 100)}%
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => previewTimelineEffect(item.sourceId)}
                              className="p-1 hover:bg-green-500/15 rounded text-white/20 hover:text-green-400 interactive">
                              <Play className="w-3 h-3 fill-current" />
                            </button>
                            <button onClick={() => removeTimelineItem(item.id)}
                              className="p-1 hover:bg-red-500/15 rounded text-white/20 hover:text-red-400 interactive">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Add Effect to Timeline */}
                {showAddTimeline ? (
                  <div className="space-y-2 glass rounded-xl p-4 border-green-500/15">
                    {/* Quick effect picker grid */}
                    <label className="text-[10px] text-white/30 uppercase tracking-[0.15em] font-bold">Escolha o efeito</label>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                      {SOUND_EFFECTS.map(e => (
                        <button key={e.id}
                          onClick={() => setTlEffectId(e.id)}
                          className={`p-2 rounded-lg flex flex-col items-center gap-0.5 interactive border ${
                            tlEffectId === e.id
                              ? 'bg-green-500/15 border-green-500/30 text-green-400'
                              : 'bg-white/[0.02] border-white/[0.04] text-white/30 hover:bg-white/[0.05]'
                          }`}
                        >
                          <span className="text-lg">{e.emoji}</span>
                          <span className="text-[8px] leading-tight text-center">{e.name}</span>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-white/30 uppercase tracking-[0.15em] font-bold">
                          Segundo (0 - {totalTimelineDuration.toFixed(0)}s)
                        </label>
                        <input type="number" min="0" max={totalTimelineDuration + 10} step="0.5" value={tlTime}
                          onChange={(e) => setTlTime(e.target.value)}
                          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs mt-1 focus:outline-none focus:border-green-500/40 interactive" />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/30 uppercase tracking-[0.15em] font-bold flex justify-between">
                          Volume <span className="text-white/40">{Math.round(tlVolume * 100)}%</span>
                        </label>
                        <input type="range" min="0" max="3" step="0.05" value={tlVolume}
                          onChange={(e) => setTlVolume(parseFloat(e.target.value))}
                          className="w-full accent-green-500 mt-3" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => previewTimelineEffect(tlEffectId)}
                        className="p-2 glass rounded-lg text-white/30 text-xs flex items-center gap-1 interactive hover:text-green-400">
                        <Headphones className="w-3 h-3" /> Ouvir
                      </button>
                      <button onClick={addTimelineEffect}
                        className="flex-1 p-2 bg-gradient-to-r from-green-600 to-green-500 rounded-lg text-white text-xs font-bold interactive">
                        <Check className="w-4 h-4 inline mr-1" /> Adicionar
                      </button>
                      <button onClick={() => setShowAddTimeline(false)}
                        className="p-2 glass rounded-lg text-white/30 interactive"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddTimeline(true)}
                    className="w-full py-2.5 border border-dashed border-green-500/15 rounded-xl text-[10px] uppercase tracking-[0.15em] text-green-400/30 font-bold hover:bg-green-500/[0.03] hover:text-green-400/50 interactive">
                    + Adicionar Efeito na Timeline
                  </button>
                )}

                {/* Template Save/Load */}
                <div className="mt-4 border-t border-white/[0.04] pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-3.5 h-3.5 text-purple-400/60" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Templates</span>
                    </div>
                    <button onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                      className="p-1.5 glass rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-purple-400 interactive"
                      title="Salvar template atual"
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {showSaveTemplate && (
                    <div className="flex gap-2 mb-3">
                      <input value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveTemplate()}
                        placeholder="Nome do template..."
                        className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-purple-500/40 interactive"
                        autoFocus />
                      <button onClick={saveTemplate}
                        className="px-3 py-2 bg-purple-600 rounded-lg text-xs font-bold interactive">Salvar</button>
                      <button onClick={() => setShowSaveTemplate(false)}
                        className="p-2 glass rounded-lg text-white/30 interactive"><X className="w-4 h-4" /></button>
                    </div>
                  )}

                  {templates.length > 0 ? (
                    <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar">
                      {templates.map(tpl => (
                        <div key={tpl.id} className="flex items-center justify-between glass rounded-lg p-2 group hover:border-purple-500/15 interactive">
                          <div className="flex items-center gap-2">
                            <FolderOpen className="w-3 h-3 text-purple-400/40" />
                            <span className="text-xs text-white/60">{tpl.name}</span>
                            <span className="text-[9px] text-white/15 font-mono">{tpl.items.length} fx</span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 interactive">
                            <button onClick={() => loadTemplate(tpl)}
                              className="px-2 py-1 bg-purple-500/15 rounded text-purple-400 text-[9px] font-bold hover:bg-purple-500/25 interactive">
                              Carregar
                            </button>
                            <button onClick={() => deleteTemplate(tpl.id)}
                              className="p-1 hover:bg-red-500/15 rounded text-white/20 hover:text-red-400 interactive">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-white/10 text-center py-1">Nenhum template salvo</p>
                  )}
                </div>

                {/* Mix Actions */}
                <div className="flex gap-2 mt-4">
                  {isPlaying ? (
                    <>
                      <button onClick={pauseMix}
                        className="flex-1 py-3 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-2 interactive text-yellow-300">
                        <Pause className="w-4 h-4" /> PAUSAR
                      </button>
                      <button onClick={stopMix}
                        className="py-3 px-4 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-2 interactive text-red-300">
                        <Square className="w-4 h-4 fill-current" />
                      </button>
                    </>
                  ) : (
                    <button onClick={playMix} disabled={isMixing}
                      className="flex-1 py-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 disabled:from-white/5 disabled:to-white/5 disabled:text-white/20 rounded-xl text-xs font-bold flex items-center justify-center gap-2 interactive shadow-lg shadow-green-900/20">
                      {isMixing ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white" />
                      ) : (
                        <><Play className="w-4 h-4 fill-current" /> {playheadTime > 0 ? 'CONTINUAR' : 'REPRODUZIR MIXAGEM'}</>
                      )}
                    </button>
                  )}
                  <button onClick={exportMix} disabled={isMixing}
                    className="flex-1 py-3 glass hover:bg-white/[0.06] rounded-xl text-xs font-bold flex items-center justify-center gap-2 interactive">
                    <Download className="w-4 h-4 text-white/50" /> EXPORTAR WAV
                  </button>
                </div>
              </>
            )}
          </section>
        </div>

        {/* ======== RIGHT COLUMN ======== */}
        <div className="lg:col-span-4 space-y-5">

          {/* === HISTORY === */}
          <section className="glass rounded-2xl flex flex-col h-[400px]">
            <div className="p-4 border-b border-white/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-white/30" />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40">Histórico</h2>
              </div>
              <span className="text-[10px] glass rounded-md px-2 py-0.5 text-white/25 font-mono">{history.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
              <AnimatePresence initial={false}>
                {history.map((item) => (
                  <motion.div key={item.id}
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    className="glass rounded-xl p-3 group hover:border-orange-500/20 interactive">
                    <p className="text-xs text-white/70 line-clamp-2 mb-2 italic">&quot;{item.text}&quot;</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] uppercase glass rounded px-1.5 py-0.5 text-white/30 font-mono">{item.voice}</span>
                        <span className="text-[9px] text-white/15 font-mono">{new Date(item.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 interactive">
                        <button onClick={() => playHistoryItem(item)} title="Reproduzir"
                          className="p-1.5 hover:bg-orange-500/15 rounded-lg text-white/30 hover:text-orange-400 interactive">
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        {playlists.length > 0 && (
                          <select className="glass text-[9px] text-white/30 rounded px-1 py-1 cursor-pointer focus:outline-none"
                            defaultValue="" onChange={(e) => { if (e.target.value) { addToPlaylist(e.target.value, item.id); e.target.value = ''; } }}>
                            <option value="" disabled>+ Playlist</option>
                            {playlists.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                          </select>
                        )}
                        <button onClick={() => downloadAudio(item)} title="Download"
                          className="p-1.5 hover:bg-white/[0.06] rounded-lg text-white/30 hover:text-white/60 interactive">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteHistoryItem(item.id)} title="Excluir"
                          className="p-1.5 hover:bg-red-500/15 rounded-lg text-white/30 hover:text-red-400 interactive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {history.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-white/[0.06] py-10">
                  <Clock className="w-10 h-10 mb-2" />
                  <p className="text-xs uppercase tracking-[0.15em] font-bold">Sem registros</p>
                </div>
              )}
            </div>
          </section>

          {/* === PLAYLISTS === */}
          <section className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-white/30" />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40">Playlists</h2>
              </div>
              <button onClick={() => setShowNewPlaylist(!showNewPlaylist)} className="p-1.5 glass rounded-lg hover:bg-white/[0.06] interactive">
                {showNewPlaylist ? <X className="w-4 h-4 text-white/30" /> : <Plus className="w-4 h-4 text-white/30" />}
              </button>
            </div>

            {showNewPlaylist && (
              <div className="flex gap-2 mb-4">
                <input value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
                  placeholder="Nome da playlist..."
                  className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-orange-500/40 interactive" autoFocus />
                <button onClick={createPlaylist} className="px-3 py-2 bg-gradient-to-r from-orange-600 to-orange-500 rounded-lg text-xs font-bold interactive">Criar</button>
              </div>
            )}

            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
              {playlists.map((pl) => (
                <div key={pl.id}
                  className={`glass rounded-xl p-4 interactive ${activePlaylist === pl.id ? 'border-orange-500/20 glow-orange' : 'hover:border-white/10'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <h3 className={`text-xs font-bold ${activePlaylist === pl.id ? 'text-orange-400' : 'text-white/70'}`}>{pl.name}</h3>
                      <p className="text-[10px] text-white/25 font-mono">{pl.items.length} locuções</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => playPlaylist(pl.id)} disabled={pl.items.length === 0 || activePlaylist !== null}
                        className="bg-gradient-to-r from-orange-600 to-orange-500 disabled:from-white/5 disabled:to-white/5 p-2 rounded-lg shadow-lg shadow-orange-900/20 disabled:shadow-none interactive">
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                      <button onClick={() => deletePlaylist(pl.id)}
                        className="p-2 glass rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 interactive">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {pl.items.length > 0 && (
                    <div className="space-y-1 mt-2 border-t border-white/[0.04] pt-2">
                      {pl.items.map((itemId, idx) => {
                        const item = history.find(h => h.id === itemId);
                        return item ? (
                          <div key={itemId} className="flex items-center justify-between text-[10px] text-white/30">
                            <span className="truncate flex-1 font-mono">{idx + 1}. {item.text}</span>
                            <button onClick={() => removeFromPlaylist(pl.id, itemId)} className="p-1 hover:text-red-400 shrink-0 interactive">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              ))}
              {playlists.length === 0 && (
                <div className="text-center text-white/[0.08] py-8">
                  <ListMusic className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-xs uppercase tracking-[0.15em] font-bold">Sem playlists</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
