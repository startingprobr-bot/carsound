'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2, Play, Music, History,
  ListMusic, Trash2, Download, Plus, Pause, Square, Upload,
  Mic2, Zap, Clock, X, Check, Timer, Headphones, Save, FolderOpen, Heart, MessageCircle, ChevronDown, Sliders
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
  duration?: number;
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

interface CustomEffect {
  id: string;
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
  const [voice, setVoice] = useState('Enceladus');
  const [speed, setSpeed] = useState(1.0);
  const [isConverting, setIsConverting] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [ttsStyle, setTtsStyle] = useState('entusiasmado');
  const [history, setHistory] = useState<Conversion[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<string | null>(null);
  const [playingHistoryId, setPlayingHistoryId] = useState<string | null>(null);

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

  // --- Custom Effects ---
  const [customEffects, setCustomEffects] = useState<CustomEffect[]>([]);
  const [isUploadingEffect, setIsUploadingEffect] = useState(false);

  // --- Waveform & Donation ---
  const [ttsWaveform, setTtsWaveform] = useState<number[]>([]);
  const [musicWaveform, setMusicWaveform] = useState<number[]>([]);
  const [showDonation, setShowDonation] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSubmittingKey, setIsSubmittingKey] = useState(false);
  const [communityKeyCount, setCommunityKeyCount] = useState(0);

  // --- Selected track & collapsible ---
  const [selectedTrack, setSelectedTrack] = useState<'tts' | 'music' | string | null>(null);
  const [sectionOpen, setSectionOpen] = useState({ text: true, voice: true, entonation: true });
  const [likeCount, setLikeCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);

  // --- Tutorial ---
  const [tourStep, setTourStep] = useState(-1); // -1 = inactive
  const tourSteps = [
    { target: '[data-tour="text"]', title: '1. Texto', desc: 'Digite aqui o texto que será falado no áudio do carro de som.' },
    { target: '[data-tour="voice"]', title: '2. Voz', desc: 'Escolha entre 20 vozes masculinas e femininas com diferentes estilos.' },
    { target: '[data-tour="entonation"]', title: '3. Entonação', desc: 'Ajuste o estilo da fala (animado, sério, etc.) e a velocidade.' },
    { target: '[data-tour="generate"]', title: '4. Gerar Áudio', desc: 'Clique aqui para gerar o áudio com IA. Você também pode importar um áudio pronto.' },
    { target: '[data-tour="timeline"]', title: '5. Timeline', desc: 'Aqui é onde você monta o áudio final: arraste, adicione efeitos e música de fundo.' },
    { target: '[data-tour="effects"]', title: '6. Efeitos e Música', desc: 'Adicione efeitos sonoros e música de fundo para deixar o áudio profissional.' },
  ];

  // --- Real-time playback gain ---
  const mixGainRef = useRef<GainNode | null>(null);

  const extractPeaks = (data: Float32Array | Int16Array, numBars: number): number[] => {
    const peaks: number[] = [];
    const step = Math.max(1, Math.floor(data.length / numBars));
    const isInt16 = data instanceof Int16Array;
    for (let i = 0; i < numBars; i++) {
      let max = 0;
      const start = i * step;
      const end = Math.min(start + step, data.length);
      for (let j = start; j < end; j++) {
        const val = isInt16 ? Math.abs(data[j]) / 32768 : Math.abs(data[j]);
        if (val > max) max = val;
      }
      peaks.push(max);
    }
    return peaks;
  };

  // ============================================================
  // INITIALIZATION
  // ============================================================
  useEffect(() => {
    loadData();
    loadMusics();
    loadCustomEffects();
    fetch('/api/keys').then(r => r.json()).then(d => setCommunityKeyCount(d.count || 0)).catch(() => {});
    fetch('/api/likes').then(r => r.json()).then(d => setLikeCount(d.count || 0)).catch(() => {});
    setHasLiked(localStorage.getItem('carro_som_liked') === '1');
    // First visit: show donation + start tutorial
    if (!localStorage.getItem('carro_som_visited')) {
      localStorage.setItem('carro_som_visited', '1');
      setTimeout(() => setShowDonation(true), 1500);
    }
    if (!localStorage.getItem('carro_som_tour_done')) {
      setTimeout(() => setTourStep(0), 2500);
    }
  }, []);

  const submitCommunityKey = async () => {
    if (!apiKeyInput.trim()) return;
    setIsSubmittingKey(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: apiKeyInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Chave adicionada com sucesso! Obrigado por contribuir 🎉');
        setApiKeyInput('');
        setCommunityKeyCount(data.count || communityKeyCount + 1);
      } else {
        toast.error(data.error || 'Erro ao adicionar chave');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setIsSubmittingKey(false);
    }
  };

  const handleLike = async () => {
    // Always open donation modal
    setShowDonation(true);
    if (hasLiked) return;
    // Simple browser fingerprint
    const fp = btoa(navigator.userAgent + screen.width + screen.height + navigator.language).slice(0, 32);
    try {
      const res = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fp }),
      });
      const data = await res.json();
      setLikeCount(data.count);
      if (!data.alreadyLiked) {
        setHasLiked(true);
        localStorage.setItem('carro_som_liked', '1');
      }
    } catch {}
  };

  // Keep bgMusic gain in sync with volume slider — invalidate mix cache for re-render
  useEffect(() => {
    if (bgGainRef.current) {
      bgGainRef.current.gain.value = bgMusicVolume;
    }
    mixedBufferRef.current = null;
  }, [bgMusicVolume]);

  // Extract music waveform when music is selected
  useEffect(() => {
    if (!selectedMusic) { setMusicWaveform([]); return; }
    const ctx = initAudioContext();
    fetch(selectedMusic)
      .then(r => r.arrayBuffer())
      .then(buf => ctx.decodeAudioData(buf))
      .then(audioBuffer => {
        const ch = audioBuffer.getChannelData(0);
        setMusicWaveform(extractPeaks(ch, 120));
      })
      .catch(() => setMusicWaveform([]));
  }, [selectedMusic]);

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
      setTtsWaveform(extractPeaks(pcm, 120));

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
        duration: pcm.length / 24000 / speed,
        blob: mp3Blob,
        base64: base64Audio,
      };

      const updatedHistory = [newConversion, ...history];
      setHistory(updatedHistory);
      saveData('history', updatedHistory.map(({ blob, audioUrl, ...rest }) => rest));

      toast.success('Áudio gerado com sucesso!');
      // Auto-collapse sidebar sections
      setSectionOpen({ text: false, voice: false, entonation: false });
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
      setTtsWaveform(extractPeaks(pcm, 120));
      mixedBufferRef.current = null;

      toast.success(`"${file.name}" importado como locução!`);
      // Auto-collapse sidebar sections
      setSectionOpen({ text: false, voice: false, entonation: false });
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
  // CUSTOM EFFECTS
  // ============================================================
  const loadCustomEffects = () => {
    try {
      const saved = localStorage.getItem('customEffects');
      if (saved) setCustomEffects(JSON.parse(saved));
    } catch { }
  };

  const uploadCustomEffect = async (file: File) => {
    setIsUploadingEffect(true);
    try {
      const url = URL.createObjectURL(file);
      const name = file.name.replace(/\.[^/.]+$/, '');
      const newEffect: CustomEffect = { id: `custom_${Date.now()}`, name, url };
      const updated = [...customEffects, newEffect];
      setCustomEffects(updated);
      localStorage.setItem('customEffects', JSON.stringify(updated.map(e => ({ ...e, url: '' }))));
      // Store blob url in memory (will persist until page reload — for permanent, we'd need server storage)
      toast.success(`Efeito "${name}" adicionado!`);
    } catch {
      toast.error('Erro ao carregar efeito');
    } finally {
      setIsUploadingEffect(false);
    }
  };

  const deleteCustomEffect = (id: string) => {
    const updated = customEffects.filter(e => e.id !== id);
    setCustomEffects(updated);
    localStorage.setItem('customEffects', JSON.stringify(updated.map(e => ({ ...e, url: '' }))));
    toast.success('Efeito removido');
  };

  // ============================================================
  // HISTORY & DOWNLOAD
  // ============================================================
  const playHistoryItem = async (item: Conversion) => {
    // If already playing this item, stop it
    if (playingHistoryId === item.id) {
      try { currentSourceRef.current?.stop(); } catch { }
      currentSourceRef.current = null;
      setPlayingHistoryId(null);
      return;
    }
    // Stop any other playing item
    try { currentSourceRef.current?.stop(); } catch { }
    currentSourceRef.current = null;

    if (item.base64) {
      setPlayingHistoryId(item.id);
      const pcm = base64ToPcm(item.base64);
      await playPcm(pcm, item.speed);
      setPlayingHistoryId(null);
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
    const builtIn = SOUND_EFFECTS.find(e => e.id === tlEffectId);
    const custom = customEffects.find(e => e.id === tlEffectId);
    const effect = builtIn || custom;
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
    mixedBufferRef.current = null;
    setShowAddTimeline(false);
  };

  const removeTimelineItem = (id: string) => {
    setTimelineItems(prev => prev.filter(i => i.id !== id));
    mixedBufferRef.current = null;
  };

  const previewTimelineEffect = (effectId: string) => {
    const ctx = initAudioContext();
    const custom = customEffects.find(e => e.id === effectId);
    if (custom && custom.url) {
      fetch(custom.url).then(r => r.arrayBuffer()).then(buf => ctx.decodeAudioData(buf)).then(audioBuffer => {
        const src = ctx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(ctx.destination);
        src.start();
      }).catch(() => toast.error('Erro ao reproduzir efeito'));
    } else {
      playEffect(ctx, effectId);
    }
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
      // Route through master gain for real-time volume control
      const masterGain = ctx.createGain();
      masterGain.gain.value = 1.0;
      source.connect(masterGain);
      masterGain.connect(ctx.destination);
      mixSourceRef.current = source;
      mixGainRef.current = masterGain;

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
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500/20 border-t-green-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen ambient-bg text-white font-sans selection:bg-green-500/30">
      <Toaster position="top-right" theme="dark" richColors />

      {/* Header */}
      <header className="glass-strong sticky top-0 z-50 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-green-500 to-green-700 p-2.5 rounded-xl shadow-lg shadow-green-900/30">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Carro de Som</h1>
            <p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">Sound Truck Engine v2.0</p>
          </div>
          <button onClick={handleLike} className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-white/[0.06] text-red-400 interactive animate-heartbeat" title="Apoie o projeto">
            <Heart className={`w-3.5 h-3.5 ${hasLiked ? 'fill-red-400' : ''}`} />
            {likeCount > 0 && <span className="text-[9px] font-mono text-red-400/70">{likeCount}</span>}
          </button>
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

      <main className="h-[calc(100vh-64px)] flex overflow-hidden">

        {/* ======== LEFT SIDEBAR ======== */}
        <aside className="w-80 min-w-[320px] flex flex-col border-r border-white/[0.06] bg-black/20 overflow-y-auto custom-scrollbar">

          {/* === SELECTED TRACK PROPERTIES (top of sidebar) === */}
          <AnimatePresence>
            {selectedTrack && lastGeneratedPcm && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="border-b border-white/[0.06] overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-green-400" />
                      <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/60">
                        {selectedTrack === 'tts' ? 'Locução' : selectedTrack === 'music' ? 'Música de Fundo' : 'Efeito Sonoro'}
                      </h2>
                    </div>
                    <button onClick={() => setSelectedTrack(null)} className="p-1 rounded-lg hover:bg-white/10 text-white/30 interactive">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {selectedTrack === 'tts' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] uppercase tracking-widest text-white/30 font-bold block mb-1">Posição (s)</label>
                        <input type="number" min="0" step="0.5" value={ttsStartTime}
                          onChange={(e) => { setTtsStartTime(Math.max(0, parseFloat(e.target.value) || 0)); mixedBufferRef.current = null; }}
                          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-green-500/40 interactive" />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-widest text-white/30 font-bold flex justify-between mb-1">
                          Velocidade <span className="text-green-400/80">{speed.toFixed(2)}x</span>
                        </label>
                        <input type="range" min="0.5" max="2.0" step="0.1" value={speed}
                          onChange={(e) => { setSpeed(parseFloat(e.target.value)); mixedBufferRef.current = null; }}
                          className="w-full accent-green-500" />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-white/40">
                        <span>Duração: <span className="text-green-400/70 font-mono">{ttsDuration.toFixed(1)}s</span></span>
                        {ttsTrimStart > 0 && <span>Trim: <span className="text-yellow-400/70 font-mono">{ttsTrimStart.toFixed(1)}s</span></span>}
                      </div>
                    </div>
                  )}

                  {selectedTrack === 'music' && selectedMusic && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] uppercase tracking-widest text-white/30 font-bold block mb-1">Início (s)</label>
                          <input type="number" min="0" step="0.5" value={bgMusicStartTime}
                            onChange={(e) => { setBgMusicStartTime(Math.max(0, parseFloat(e.target.value) || 0)); mixedBufferRef.current = null; }}
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-blue-500/40 interactive" />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase tracking-widest text-white/30 font-bold block mb-1">Fim (s)</label>
                          <input type="number" min="0" step="0.5" value={bgMusicEndTime ?? ''}
                            placeholder="∞"
                            onChange={(e) => { const v = parseFloat(e.target.value); setBgMusicEndTime(isNaN(v) ? null : Math.max(bgMusicStartTime + 0.5, v)); mixedBufferRef.current = null; }}
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-blue-500/40 interactive placeholder:text-white/15" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-widest text-white/30 font-bold flex justify-between mb-1">
                          Volume <span className={`${bgMusicVolume > 1 ? 'text-yellow-400' : 'text-blue-400/80'}`}>{Math.round(bgMusicVolume * 100)}%</span>
                        </label>
                        <input type="range" min="0" max="3" step="0.05" value={bgMusicVolume}
                          onChange={(e) => { setBgMusicVolume(parseFloat(e.target.value)); mixedBufferRef.current = null; }}
                          className="w-full accent-blue-500" />
                      </div>
                      <button onClick={() => { setSelectedMusic(null); setBgMusicTrimStart(0); setBgMusicStartTime(0); setBgMusicEndTime(null); setSelectedTrack(null); mixedBufferRef.current = null; }}
                        className="w-full py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] text-red-400/70 hover:bg-red-500/20 interactive">
                        Remover Música
                      </button>
                    </div>
                  )}

                  {selectedTrack?.startsWith('effect:') && (() => {
                    const effectId = selectedTrack.replace('effect:', '');
                    const item = timelineItems.find(i => i.id === effectId);
                    if (!item) return null;
                    const builtInEff = SOUND_EFFECTS.find(e => e.id === item.sourceId);
                    const customEff = customEffects.find(e => e.id === item.sourceId);
                    const effName = builtInEff?.name ?? customEff?.name ?? item.name;
                    return (
                      <div className="space-y-3">
                        <div className="text-[10px] text-white/50 font-medium">{effName}</div>
                        <div>
                          <label className="text-[9px] uppercase tracking-widest text-white/30 font-bold block mb-1">Posição (s)</label>
                          <input type="number" min="0" step="0.5" value={item.startTime}
                            onChange={(e) => { updateTimelineItem(item.id, 'startTime', parseFloat(e.target.value) || 0); }}
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-green-500/40 interactive" />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase tracking-widest text-white/30 font-bold flex justify-between mb-1">
                            Volume <span className={`${item.volume > 1 ? 'text-yellow-400' : 'text-green-400/80'}`}>{Math.round(item.volume * 100)}%</span>
                          </label>
                          <input type="range" min="0" max="3" step="0.05" value={item.volume}
                            onChange={(e) => { updateTimelineItem(item.id, 'volume', parseFloat(e.target.value)); }}
                            className="w-full accent-green-500" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => previewTimelineEffect(item.sourceId)}
                            className="flex-1 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-[10px] text-white/50 hover:text-green-400 interactive flex items-center justify-center gap-1">
                            <Headphones className="w-3 h-3" /> Ouvir
                          </button>
                          <button onClick={() => { removeTimelineItem(item.id); setSelectedTrack(null); }}
                            className="flex-1 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] text-red-400/70 hover:bg-red-500/20 interactive">
                            Remover
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* === TEXT INPUT === */}
          <div className="border-b border-white/[0.06]" data-tour="text">
            <button onClick={() => setSectionOpen(p => ({ ...p, text: !p.text }))} className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] interactive">
              <div className="flex items-center gap-2">
                <Mic2 className="w-4 h-4 text-green-400" />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/60">Texto para Locução</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-white/30 font-mono">{text.length} chars</span>
                <ChevronDown className={`w-3.5 h-3.5 text-white/30 transition-transform ${sectionOpen.text ? '' : '-rotate-90'}`} />
              </div>
            </button>
            {sectionOpen.text && (
              <div className="px-4 pb-4">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Digite o anúncio aqui... (ex: ATENÇÃO! OFERTA IMPERDÍVEL!)"
                  className="w-full h-28 bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 text-sm text-white/90 focus:outline-none focus:border-green-500/50 focus:bg-white/[0.06] transition-all resize-none placeholder:text-white/20"
                />
              </div>
            )}
          </div>

          {/* === VOICE SELECTOR (Dropdown) === */}
          <div className="border-b border-white/[0.06]" data-tour="voice">
            <button onClick={() => setSectionOpen(p => ({ ...p, voice: !p.voice }))} className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] interactive">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-green-400" />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/60">Voz do Locutor</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-green-400/60 font-mono">{voice}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-white/30 transition-transform ${sectionOpen.voice ? '' : '-rotate-90'}`} />
              </div>
            </button>
            {sectionOpen.voice && (
              <div className="px-4 pb-4">
                <div className="relative" ref={voiceDropdownRef}>
                  <button onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                    className="w-full flex items-center justify-between bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm interactive hover:bg-white/[0.06] hover:border-white/[0.12]">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${VOICES.find(v => v.name === voice)?.gender === 'M' ? 'bg-blue-500/20 text-blue-300' : 'bg-pink-500/20 text-pink-300'}`}>
                        {VOICES.find(v => v.name === voice)?.gender === 'M' ? '♂' : '♀'}
                      </span>
                      <span className="text-white/90 font-medium">{voice}</span>
                      {VOICES.find(v => v.name === voice)?.desc && (
                        <span className="text-[9px] text-white/30">{VOICES.find(v => v.name === voice)?.desc}</span>
                      )}
                    </div>
                    <svg className={`w-4 h-4 text-white/30 transition-transform ${showVoiceDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>

              {showVoiceDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#141418] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/60 max-h-[340px] overflow-y-auto custom-scrollbar">
                  {/* Masculinas */}
                  <div className="px-3 pt-3 pb-1">
                    <span className="text-[9px] uppercase tracking-[0.15em] text-blue-400/60 font-bold">♂ Masculinas</span>
                  </div>
                  {VOICES.filter(v => v.gender === 'M').map((v) => (
                    <div key={v.name}
                      className={`flex items-center justify-between px-3 py-2 cursor-pointer interactive ${
                        voice === v.name ? 'bg-green-500/15 text-green-300' : 'text-white/70 hover:bg-white/[0.06]'
                      }`}
                      onClick={() => { setVoice(v.name); setShowVoiceDropdown(false); }}>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-bold">♂</span>
                        <span className="text-sm font-medium">{v.label}</span>
                        {v.desc && <span className="text-[9px] text-white/25">{v.desc}</span>}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); previewVoice(v.name); }}
                        disabled={previewingVoice !== null}
                        className="p-1.5 rounded-lg hover:bg-green-500/20 interactive"
                        title={`Ouvir ${v.name}`}>
                        {previewingVoice === v.name ? (
                          <div className="animate-spin rounded-full h-3 w-3 border border-white/20 border-t-green-400" />
                        ) : (
                          <Play className="w-3 h-3 fill-current text-white/30 hover:text-green-400" />
                        )}
                      </button>
                    </div>
                  ))}
                  {/* Divisor */}
                  <div className="border-t border-white/[0.06] mx-3 my-1" />
                  {/* Femininas */}
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-[9px] uppercase tracking-[0.15em] text-pink-400/60 font-bold">♀ Femininas</span>
                  </div>
                  {VOICES.filter(v => v.gender === 'F').map((v) => (
                    <div key={v.name}
                      className={`flex items-center justify-between px-3 py-2 cursor-pointer interactive ${
                        voice === v.name ? 'bg-green-500/15 text-green-300' : 'text-white/70 hover:bg-white/[0.06]'
                      }`}
                      onClick={() => { setVoice(v.name); setShowVoiceDropdown(false); }}>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded font-bold">♀</span>
                        <span className="text-sm font-medium">{v.label}</span>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); previewVoice(v.name); }}
                        disabled={previewingVoice !== null}
                        className="p-1.5 rounded-lg hover:bg-green-500/20 interactive"
                        title={`Ouvir ${v.name}`}>
                        {previewingVoice === v.name ? (
                          <div className="animate-spin rounded-full h-3 w-3 border border-white/20 border-t-green-400" />
                        ) : (
                          <Play className="w-3 h-3 fill-current text-white/30 hover:text-green-400" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
              </div>
            )}
          </div>

          {/* === ENTONAÇÃO + VELOCIDADE === */}
          <div className="border-b border-white/[0.06]" data-tour="entonation">
            <button onClick={() => setSectionOpen(p => ({ ...p, entonation: !p.entonation }))} className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] interactive">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-green-400" />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/60">Entonação & Velocidade</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-green-400/60 font-mono">{TTS_STYLES.find(s => s.id === ttsStyle)?.label} · {speed.toFixed(1)}x</span>
                <ChevronDown className={`w-3.5 h-3.5 text-white/30 transition-transform ${sectionOpen.entonation ? '' : '-rotate-90'}`} />
              </div>
            </button>
            {sectionOpen.entonation && (
              <div className="px-4 pb-4">
            <label className="text-[10px] uppercase tracking-[0.15em] text-white/40 font-bold mb-2 block">
              Entonação da Voz
            </label>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {TTS_STYLES.map(s => (
                <button key={s.id} onClick={() => setTtsStyle(s.id)}
                  className={`px-2 py-2 rounded-lg text-[10px] font-medium border interactive ${
                    ttsStyle === s.id
                      ? 'bg-green-500/20 border-green-500/40 text-green-300'
                      : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:bg-white/[0.08]'
                  }`}
                  title={s.desc}>
                  {s.label}
                </button>
              ))}
            </div>

            <label className="text-[10px] uppercase tracking-[0.15em] text-white/40 font-bold flex justify-between mb-2">
              Velocidade <span className="text-green-400/80">{speed.toFixed(1)}x</span>
            </label>
            <input type="range" min="0.5" max="2.0" step="0.1" value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full accent-green-500" />
            <div className="flex justify-between text-[9px] text-white/20 mt-1">
              <span>Lento</span><span>Rápido</span>
            </div>
              </div>
            )}
          </div>

          {/* === GERAR / IMPORTAR / DOWNLOAD === */}
          <div className="p-4 border-b border-white/[0.06]" data-tour="generate">
            <button onClick={handleConvert} disabled={isConverting}
              className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 disabled:from-white/[0.06] disabled:to-white/[0.06] disabled:text-white/20 py-3 rounded-xl font-bold flex items-center justify-center gap-2 interactive shadow-lg shadow-green-900/20 mb-2">
              {isConverting ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white" />
              ) : (
                <><Zap className="w-5 h-5 fill-current" />GERAR ÁUDIO</>
              )}
            </button>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input type="file" accept="audio/*" className="hidden" id="import-voice-file"
                  onChange={(e) => { if (e.target.files?.[0]) { importVoiceFile(e.target.files[0]); e.target.value = ''; } }} />
                <label htmlFor="import-voice-file" title="Importar áudio de locução existente"
                  className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 interactive cursor-pointer text-white/50 hover:text-white/70">
                  <Upload className="w-4 h-4" /> Importar
                </label>
              </div>
              {lastGeneratedPcm && (
                <button onClick={downloadTtsAudio} title="Baixar locução sem mixar"
                  className="flex-1 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 interactive text-white/50 hover:text-white/70">
                  <Download className="w-4 h-4" /> Download
                </button>
              )}
            </div>
          </div>

          {/* === HISTORY === */}
          <div className="flex flex-col border-b border-white/[0.06]" style={{ maxHeight: '40vh' }}>
            <div className="p-4 pb-2 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-white/40" />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/50">Histórico</h2>
              </div>
              <span className="text-[10px] bg-white/[0.06] rounded-md px-2 py-0.5 text-white/35 font-mono">{history.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-3 custom-scrollbar">
              <AnimatePresence initial={false}>
                {history.map((item) => (
                  <motion.div key={item.id}
                    initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    className="flex items-center gap-2 py-2 border-b border-white/[0.04] last:border-0 group">
                    {/* Play/Pause button always visible */}
                    <button onClick={() => playHistoryItem(item)} title={playingHistoryId === item.id ? 'Parar' : 'Reproduzir'}
                      className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg interactive ${playingHistoryId === item.id ? 'bg-red-500/20 text-red-400' : 'bg-green-500/10 text-green-400/70 hover:bg-green-500/20 hover:text-green-400'}`}>
                      {playingHistoryId === item.id ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                    </button>
                    {/* Text + meta — click to transfer text */}
                    <div className="flex-1 min-w-0 cursor-pointer hover:bg-white/[0.03] rounded px-1 -mx-1 interactive" onClick={() => { setText(item.text); setVoice(item.voice); setSpeed(item.speed); toast.success('Texto carregado'); }}>
                      <p className="text-[11px] text-white/80 truncate">{item.text}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[8px] text-white/30 font-mono">{item.voice}</span>
                        <span className="text-[8px] text-white/20 font-mono">{item.text.length} chars</span>
                        {item.duration && <span className="text-[8px] text-green-400/40 font-mono">{item.duration.toFixed(1)}s</span>}
                        <span className="text-[8px] text-white/15 font-mono">{new Date(item.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 interactive">
                      {playlists.length > 0 && (
                        <select className="bg-white/[0.06] text-[8px] text-white/40 rounded px-1 py-0.5 cursor-pointer focus:outline-none"
                          defaultValue="" onChange={(e) => { if (e.target.value) { addToPlaylist(e.target.value, item.id); e.target.value = ''; } }}>
                          <option value="" disabled>+PL</option>
                          {playlists.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                        </select>
                      )}
                      <button onClick={() => downloadAudio(item)} title="Download"
                        className="p-1 hover:bg-white/[0.08] rounded text-white/30 hover:text-white/60 interactive">
                        <Download className="w-3 h-3" />
                      </button>
                      <button onClick={() => deleteHistoryItem(item.id)} title="Excluir"
                        className="p-1 hover:bg-red-500/20 rounded text-white/30 hover:text-red-400 interactive">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {history.length === 0 && (
                <div className="flex flex-col items-center justify-center text-white/[0.08] py-6">
                  <Clock className="w-6 h-6 mb-1" />
                  <p className="text-[9px] uppercase tracking-[0.15em] font-bold">Sem registros</p>
                </div>
              )}
            </div>
          </div>

          {/* === PLAYLISTS === */}
          <div className="flex flex-col" style={{ maxHeight: '35vh' }}>
            <div className="p-4 pb-2 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-white/40" />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/50">Playlists</h2>
              </div>
              <button onClick={() => setShowNewPlaylist(!showNewPlaylist)} className="p-1.5 bg-white/[0.04] rounded-lg hover:bg-white/[0.08] interactive">
                {showNewPlaylist ? <X className="w-4 h-4 text-white/40" /> : <Plus className="w-4 h-4 text-white/40" />}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
            {showNewPlaylist && (
              <div className="flex gap-2 mb-3">
                <input value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
                  placeholder="Nome da playlist..."
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-green-500/50 interactive" autoFocus />
                <button onClick={createPlaylist} className="px-3 py-2 bg-gradient-to-r from-green-600 to-green-500 rounded-lg text-xs font-bold interactive">Criar</button>
              </div>
            )}

            <div className="space-y-2">
              {playlists.map((pl) => (
                <div key={pl.id}
                  className={`bg-white/[0.04] border rounded-xl p-3 interactive ${activePlaylist === pl.id ? 'border-green-500/30 bg-green-500/[0.06]' : 'border-white/[0.08] hover:border-white/[0.12]'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <h3 className={`text-xs font-bold ${activePlaylist === pl.id ? 'text-green-400' : 'text-white/80'}`}>{pl.name}</h3>
                      <p className="text-[10px] text-white/30 font-mono">{pl.items.length} locuções</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => playPlaylist(pl.id)} disabled={pl.items.length === 0 || activePlaylist !== null}
                        className="bg-gradient-to-r from-green-600 to-green-500 disabled:from-white/[0.06] disabled:to-white/[0.06] p-2 rounded-lg shadow-lg shadow-green-900/20 disabled:shadow-none interactive">
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                      <button onClick={() => deletePlaylist(pl.id)}
                        className="p-2 bg-white/[0.04] rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 interactive">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {pl.items.length > 0 && (
                    <div className="space-y-1 mt-2 border-t border-white/[0.06] pt-2">
                      {pl.items.map((itemId, idx) => {
                        const item = history.find(h => h.id === itemId);
                        return item ? (
                          <div key={itemId} className="flex items-center justify-between text-[10px] text-white/40">
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
                <div className="text-center text-white/[0.1] py-6">
                  <ListMusic className="w-6 h-6 mx-auto mb-1" />
                  <p className="text-[10px] uppercase tracking-[0.15em] font-bold">Sem playlists</p>
                </div>
              )}
            </div>
            </div>
          </div>
        </aside>

        {/* ======== RIGHT: TIMELINE (full width) ======== */}
        <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-5">
          <section className="glass rounded-2xl p-6 glow-green flex-1 flex flex-col" data-tour="timeline">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-green-400" />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/60">Timeline</h2>
              </div>
              <div className="flex items-center gap-2">
                {lastGeneratedPcm && (
                  <span className="text-[10px] bg-white/[0.06] rounded-lg px-2.5 py-1 text-white/40 font-mono">
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
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-white/25 text-center py-8">
                  Gere um áudio primeiro para montar a timeline de efeitos e música
                </p>
              </div>
            ) : (
              <>
                {/* Visual Timeline Bar - Draggable */}
                <div ref={timelineBarRef} className="relative bg-black/30 rounded-xl mb-4 border border-white/[0.06] p-3 select-none">
                  {/* Time ruler - click to seek */}
                  <div className="flex justify-between text-[9px] text-white/25 mb-2 px-1 font-mono cursor-pointer hover:text-white/40 interactive"
                    onClick={(e) => {
                      const bar = timelineBarRef.current;
                      if (!bar) return;
                      const rect = bar.getBoundingClientRect();
                      const x = Math.max(0, Math.min(e.clientX - rect.left - 12, rect.width - 24));
                      const t = (x / (rect.width - 24)) * totalTimelineDuration;
                      setPlayheadTime(Math.max(0, t));
                      playheadRef.current = Math.max(0, t);
                      mixedBufferRef.current = null;
                    }}>
                    {Array.from({ length: Math.min(Math.ceil(totalTimelineDuration) + 1, 11) }, (_, i) => {
                      const totalSecs = Math.ceil(totalTimelineDuration);
                      const sec = totalSecs <= 10 ? i : Math.round(i * totalSecs / 10);
                      return <span key={i}>{sec}s</span>;
                    })}
                  </div>

                  {/* TTS track - draggable with trim handles */}
                  <div className="relative h-10 mb-1">
                    <div className={`absolute inset-y-0 track-tts rounded-lg flex items-center gap-0 touch-none overflow-hidden ${selectedTrack === 'tts' ? 'border-2 border-green-400 shadow-lg shadow-green-500/20' : 'border border-green-500/25'}`}
                      style={{ left: `${(ttsStartTime / totalTimelineDuration) * 100}%`, width: `${(ttsDuration / totalTimelineDuration) * 100}%` }}
                      onClick={() => setSelectedTrack(selectedTrack === 'tts' ? null : 'tts')}>
                      {/* Waveform overlay */}
                      {ttsWaveform.length > 0 && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50" preserveAspectRatio="none" viewBox={`0 0 ${ttsWaveform.length} 100`}>
                          {ttsWaveform.map((peak, i) => {
                            const h = Math.max(1, peak * 90);
                            return <line key={i} x1={i + 0.5} y1={50 - h / 2} x2={i + 0.5} y2={50 + h / 2} stroke="rgb(134,239,172)" strokeWidth={0.4} />;
                          })}
                        </svg>
                      )}
                      {/* Left trim handle */}
                      <div className="absolute left-0 top-0 bottom-0 w-2.5 cursor-col-resize z-20 flex items-center justify-center hover:bg-green-400/30 rounded-l"
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
                        <div className="w-0.5 h-4 bg-green-400/70 rounded" />
                      </div>

                      {/* Center drag area */}
                      <div className="flex-1 flex items-center px-3 gap-2 cursor-grab active:cursor-grabbing min-w-0"
                        onPointerDown={(e) => {
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
                        <span className="text-[10px] text-green-200 font-bold truncate">🎙️ Locução {ttsTrimStart > 0 ? `✂${ttsTrimStart.toFixed(1)}s ` : ''}({ttsDuration.toFixed(1)}s)</span>
                      </div>

                      {/* Right trim handle */}
                      <div className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize z-20 flex items-center justify-center hover:bg-green-400/30 rounded-r"
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
                        <div className="w-0.5 h-4 bg-green-400/70 rounded" />
                      </div>
                    </div>
                  </div>

                  {/* Background music track - integrated controls */}
                  <div className="relative h-10 mb-1">
                    {selectedMusic ? (
                      <div className={`absolute inset-y-0 track-music rounded-lg flex items-center gap-0 group/music touch-none overflow-hidden ${selectedTrack === 'music' ? 'border-2 border-blue-400 shadow-lg shadow-blue-500/20' : 'border border-blue-500/25'}`}
                        style={{
                          left: `${(bgMusicStartTime / totalTimelineDuration) * 100}%`,
                          width: bgMusicEndTime !== null
                            ? `${((bgMusicEndTime - bgMusicStartTime) / totalTimelineDuration) * 100}%`
                            : `${((totalTimelineDuration - bgMusicStartTime) / totalTimelineDuration) * 100}%`,
                        }}
                        onClick={() => setSelectedTrack(selectedTrack === 'music' ? null : 'music')}>
                        {/* Music waveform overlay - scales with volume */}
                        {musicWaveform.length > 0 && (
                          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40" preserveAspectRatio="none" viewBox={`0 0 ${musicWaveform.length} 100`}>
                            {musicWaveform.map((peak, i) => {
                              const volScale = Math.min(bgMusicVolume / 1, 1);
                              const h = Math.max(1, peak * 90 * volScale);
                              return <line key={i} x1={i + 0.5} y1={50 - h / 2} x2={i + 0.5} y2={50 + h / 2} stroke="rgb(147,197,253)" strokeWidth={0.4} />;
                            })}
                          </svg>
                        )}
                        {/* Left trim handle */}
                        <div className="absolute left-0 top-0 bottom-0 w-2.5 cursor-col-resize z-20 flex items-center justify-center hover:bg-blue-400/30 rounded-l"
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
                          <div className="w-0.5 h-4 bg-blue-400/70 rounded" />
                        </div>

                        {/* Center drag area - moves whole bar */}
                        <div className="flex-1 flex items-center px-3 gap-2 cursor-grab active:cursor-grabbing min-w-0"
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
                          <span className="text-[10px] text-blue-200 font-medium truncate">🎵 Música{bgMusicTrimStart > 0 ? ` ✂${bgMusicTrimStart.toFixed(1)}s` : ''} ({bgMusicStartTime.toFixed(1)}s)</span>
                          <span className={`text-[9px] ml-auto font-mono ${bgMusicVolume > 1 ? 'text-yellow-400' : 'text-blue-300/60'}`}>{Math.round(bgMusicVolume * 100)}%</span>
                          <button onClick={() => { setSelectedMusic(null); setBgMusicTrimStart(0); setBgMusicStartTime(0); setBgMusicEndTime(null); mixedBufferRef.current = null; }} className="text-blue-400/50 hover:text-red-400">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Right trim handle */}
                        <div className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize z-20 flex items-center justify-center hover:bg-blue-400/30 rounded-r"
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
                          <div className="w-0.5 h-4 bg-blue-400/70 rounded" />
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-y-0 left-0 w-full rounded-lg bg-blue-500/[0.06] border border-blue-500/15 flex items-center justify-center">
                        <span className="text-[10px] text-blue-300/30">🎵 Adicione música abaixo</span>
                      </div>
                    )}
                  </div>

                  {/* Effects tracks */}
                  {Array.from({ length: numEffectLayers }, (_, layerIndex) => (
                    <div key={layerIndex} className="relative h-10 mt-1">
                      <div className="absolute inset-y-0 left-0 w-full track-effect rounded-lg border border-green-500/15">
                        {layerIndex === 0 && timelineItems.length === 0 && (
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/15">
                            Arraste efeitos aqui ou clique + Adicionar
                          </span>
                        )}
                        {timelineItems.filter(item => (effectLayers.get(item.id) ?? 0) === layerIndex).map((item) => {
                          const leftPct = (item.startTime / totalTimelineDuration) * 100;
                          const builtEff = SOUND_EFFECTS.find(e => e.id === item.sourceId);
                          const custEff = customEffects.find(e => e.id === item.sourceId);
                          const effName = builtEff?.name ?? custEff?.name ?? item.name;
                          const isDragging = draggingItem === item.id;
                          const isSelected = selectedTrack === `effect:${item.id}`;
                          return (
                            <div key={item.id}
                              className={`absolute top-0 bottom-0 flex items-center touch-none ${isDragging ? 'z-20' : 'z-10'}`}
                              style={{ left: `${Math.min(leftPct, 92)}%` }}
                              onPointerDown={(e) => handleTimelineDragStart(e, item.id)}
                              onClick={() => setSelectedTrack(isSelected ? null : `effect:${item.id}`)}
                              title={`${effName} @ ${item.startTime}s (vol ${Math.round(item.volume * 100)}%) — clique para editar`}
                            >
                              <div className={`rounded-md px-2 py-1 flex items-center gap-1 cursor-grab active:cursor-grabbing interactive ${
                                isSelected
                                  ? 'bg-green-500/30 border-2 border-green-400 shadow-lg shadow-green-500/20'
                                  : isDragging
                                  ? 'bg-green-500/30 border-2 border-green-400 scale-110 shadow-lg shadow-green-500/20'
                                  : 'bg-green-500/15 border border-green-500/30 hover:bg-green-500/25'
                              }`}>
                                <Volume2 className="w-3 h-3 text-green-300" />
                                <span className="text-[9px] text-green-300/80 font-mono">{item.startTime.toFixed(1)}s</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Playhead */}
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
                      {!isPlaying && playheadTime > 0 && (
                        <div className="absolute -top-7 -left-6 bg-black/80 border border-white/10 rounded px-1.5 py-0.5 text-[8px] font-mono text-yellow-300 whitespace-nowrap pointer-events-none">
                          {formatTimecode(playheadTime)}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Timeline Items List — compact, click to select */}
                {timelineItems.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {timelineItems.map((item) => {
                      const builtInEff = SOUND_EFFECTS.find(e => e.id === item.sourceId);
                      const customEff = customEffects.find(e => e.id === item.sourceId);
                      const effName = builtInEff?.name ?? customEff?.name ?? item.name;
                      const isSelected = selectedTrack === `effect:${item.id}`;
                      return (
                        <button key={item.id} onClick={() => setSelectedTrack(isSelected ? null : `effect:${item.id}`)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] interactive ${
                            isSelected ? 'bg-green-500/20 border border-green-500/40 text-green-300' : 'bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/70'
                          }`}>
                          <Volume2 className="w-3 h-3" />
                          <span className="font-medium">{effName}</span>
                          <span className="text-white/25 font-mono">{item.startTime.toFixed(1)}s</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Add Effect to Timeline */}
                {showAddTimeline ? (
                  <div className="space-y-3 bg-white/[0.03] border border-green-500/15 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-white/40 uppercase tracking-[0.15em] font-bold">Escolha o efeito</label>
                      <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-500/10 border border-green-500/25 rounded-lg text-[10px] text-green-300 cursor-pointer hover:bg-green-500/20 interactive">
                        <Upload className="w-3 h-3" />
                        Upload
                        <input type="file" accept="audio/*" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadCustomEffect(file);
                          e.target.value = '';
                        }} />
                      </label>
                    </div>

                    <div className="max-h-[200px] overflow-y-auto custom-scrollbar space-y-1">
                      {/* Built-in effects */}
                      <p className="text-[9px] text-white/25 uppercase tracking-widest font-bold px-1 pt-1">Padrão</p>
                      {SOUND_EFFECTS.map(e => (
                        <button key={e.id}
                          onClick={() => setTlEffectId(e.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left interactive border ${
                            tlEffectId === e.id
                              ? 'bg-green-500/15 border-green-500/30 text-green-300'
                              : 'bg-white/[0.02] border-transparent text-white/50 hover:bg-white/[0.05] hover:text-white/70'
                          }`}
                        >
                          <Volume2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="text-xs">{e.name}</span>
                        </button>
                      ))}

                      {/* Custom effects */}
                      {customEffects.length > 0 && (
                        <>
                          <p className="text-[9px] text-white/25 uppercase tracking-widest font-bold px-1 pt-2">Meus efeitos</p>
                          {customEffects.map(e => (
                            <div key={e.id} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border ${
                              tlEffectId === e.id
                                ? 'bg-green-500/15 border-green-500/30 text-green-300'
                                : 'bg-white/[0.02] border-transparent text-white/50 hover:bg-white/[0.05]'
                            }`}>
                              <button onClick={() => setTlEffectId(e.id)} className="flex items-center gap-2 flex-1 text-left interactive">
                                <Upload className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="text-xs">{e.name}</span>
                              </button>
                              <button onClick={() => deleteCustomEffect(e.id)} className="p-1 text-white/20 hover:text-red-400 interactive">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-white/40 uppercase tracking-[0.15em] font-bold">
                          Segundo (0 - {totalTimelineDuration.toFixed(0)}s)
                        </label>
                        <input type="number" min="0" max={totalTimelineDuration + 10} step="0.5" value={tlTime}
                          onChange={(e) => setTlTime(e.target.value)}
                          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 mt-1 focus:outline-none focus:border-green-500/40 interactive" />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/40 uppercase tracking-[0.15em] font-bold flex justify-between">
                          Volume <span className="text-white/50">{Math.round(tlVolume * 100)}%</span>
                        </label>
                        <input type="range" min="0" max="3" step="0.05" value={tlVolume}
                          onChange={(e) => setTlVolume(parseFloat(e.target.value))}
                          className="w-full accent-green-500 mt-3" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => previewTimelineEffect(tlEffectId)}
                        className="p-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white/40 text-xs flex items-center gap-1 interactive hover:text-green-400">
                        <Headphones className="w-3.5 h-3.5" /> Ouvir
                      </button>
                      <button onClick={addTimelineEffect}
                        className="flex-1 p-2.5 bg-gradient-to-r from-green-600 to-green-500 rounded-lg text-white text-xs font-bold interactive">
                        <Check className="w-4 h-4 inline mr-1" /> Adicionar
                      </button>
                      <button onClick={() => setShowAddTimeline(false)}
                        className="p-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white/40 interactive"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2" data-tour="effects">
                    <button onClick={() => setShowAddTimeline(true)}
                      className="flex-1 py-3 border border-dashed border-green-500/20 rounded-xl text-[10px] uppercase tracking-[0.15em] text-green-300/40 font-bold hover:bg-green-500/[0.04] hover:text-green-300/60 interactive">
                      + Efeito Sonoro
                    </button>
                    <div className="flex-1 relative">
                      {!selectedMusic ? (
                        <>
                          <input type="file" accept="audio/*" className="hidden" id="bg-music-upload-btn"
                            onChange={(e) => e.target.files?.[0] && handleMusicUpload(e.target.files[0])} />
                          {savedMusics.length > 0 ? (
                            <div className="relative h-full">
                              <select className="w-full h-full py-3 border border-dashed border-blue-500/20 rounded-xl text-[10px] uppercase tracking-[0.15em] text-blue-300/40 font-bold bg-transparent hover:bg-blue-500/[0.04] hover:text-blue-300/60 interactive text-center cursor-pointer focus:outline-none appearance-none"
                                defaultValue="" onChange={(e) => { if (e.target.value === '__upload__') { document.getElementById('bg-music-upload-btn')?.click(); } else if (e.target.value) { setSelectedMusic(e.target.value); } }}>
                                <option value="" disabled>+ Música de Fundo</option>
                                {savedMusics.map(m => <option key={m.name} value={m.url}>{m.name}</option>)}
                                <option value="__upload__">📁 Upload novo...</option>
                              </select>
                            </div>
                          ) : (
                            <label htmlFor="bg-music-upload-btn"
                              className="flex items-center justify-center w-full h-full py-3 border border-dashed border-blue-500/20 rounded-xl text-[10px] uppercase tracking-[0.15em] text-blue-300/40 font-bold hover:bg-blue-500/[0.04] hover:text-blue-300/60 interactive cursor-pointer">
                              + Música de Fundo
                            </label>
                          )}
                        </>
                      ) : (
                        <button onClick={() => setSelectedTrack('music')}
                          className="w-full py-3 border border-blue-500/30 bg-blue-500/10 rounded-xl text-[10px] uppercase tracking-[0.15em] text-blue-300/60 font-bold hover:bg-blue-500/20 interactive">
                          🎵 Música Adicionada
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Template Save/Load */}
                <div className="mt-4 border-t border-white/[0.06] pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-3.5 h-3.5 text-purple-400/70" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">Templates</span>
                    </div>
                    <button onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                      className="p-1.5 bg-white/[0.04] rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-purple-400 interactive"
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
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-purple-500/40 interactive"
                        autoFocus />
                      <button onClick={saveTemplate}
                        className="px-3 py-2 bg-purple-600 rounded-lg text-xs font-bold interactive">Salvar</button>
                      <button onClick={() => setShowSaveTemplate(false)}
                        className="p-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white/40 interactive"><X className="w-4 h-4" /></button>
                    </div>
                  )}

                  {templates.length > 0 ? (
                    <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar">
                      {templates.map(tpl => (
                        <div key={tpl.id} className="flex items-center justify-between bg-white/[0.04] border border-white/[0.08] rounded-lg p-2 group hover:border-purple-500/20 interactive">
                          <div className="flex items-center gap-2">
                            <FolderOpen className="w-3 h-3 text-purple-400/50" />
                            <span className="text-xs text-white/70">{tpl.name}</span>
                            <span className="text-[9px] text-white/25 font-mono">{tpl.items.length} fx</span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 interactive">
                            <button onClick={() => loadTemplate(tpl)}
                              className="px-2 py-1 bg-purple-500/15 rounded text-purple-300 text-[9px] font-bold hover:bg-purple-500/25 interactive">
                              Carregar
                            </button>
                            <button onClick={() => deleteTemplate(tpl.id)}
                              className="p-1 hover:bg-red-500/20 rounded text-white/25 hover:text-red-400 interactive">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-white/15 text-center py-1">Nenhum template salvo</p>
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
                      className="flex-1 py-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 disabled:from-white/[0.06] disabled:to-white/[0.06] disabled:text-white/20 rounded-xl text-xs font-bold flex items-center justify-center gap-2 interactive shadow-lg shadow-green-900/20">
                      {isMixing ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white" />
                      ) : (
                        <><Play className="w-4 h-4 fill-current" /> {playheadTime > 0 ? 'CONTINUAR' : 'REPRODUZIR MIXAGEM'}</>
                      )}
                    </button>
                  )}
                  <button onClick={exportMix} disabled={isMixing}
                    className="flex-1 py-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-xs font-bold flex items-center justify-center gap-2 interactive text-white/60">
                    <Download className="w-4 h-4" /> EXPORTAR WAV
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {/* Tutorial Overlay */}
      <AnimatePresence>
        {tourStep >= 0 && tourStep < tourSteps.length && !showDonation && (() => {
          const step = tourSteps[tourStep];
          const el = typeof document !== 'undefined' ? document.querySelector(step.target) : null;
          const rect = el?.getBoundingClientRect();
          if (!rect) return null;
          const isRight = rect.left > window.innerWidth / 2;
          const isBottom = rect.top > window.innerHeight / 2;
          return (
            <motion.div key={tourStep} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] pointer-events-none">
              {/* Dim overlay with hole */}
              <div className="absolute inset-0 pointer-events-auto" onClick={() => { setTourStep(-1); localStorage.setItem('carro_som_tour_done', '1'); }}
                style={{
                  background: `radial-gradient(ellipse ${Math.max(rect.width + 40, 120)}px ${Math.max(rect.height + 40, 80)}px at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent 50%, rgba(0,0,0,0.75) 100%)`,
                }} />
              {/* Highlight ring */}
              <div className="absolute border-2 border-green-400/60 rounded-xl pointer-events-none animate-pulse"
                style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />
              {/* Tooltip */}
              <motion.div initial={{ opacity: 0, y: isBottom ? 10 : -10 }} animate={{ opacity: 1, y: 0 }}
                className="absolute pointer-events-auto glass-strong rounded-xl p-4 shadow-2xl border border-green-500/30 max-w-xs"
                style={{
                  left: isRight ? Math.max(rect.left - 260, 16) : Math.min(rect.left, window.innerWidth - 300),
                  top: isBottom ? rect.top - 140 : rect.bottom + 12,
                }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-[10px] font-bold text-green-400">{tourStep + 1}</div>
                  <h4 className="text-sm font-bold text-white">{step.title}</h4>
                </div>
                <p className="text-xs text-white/70 leading-relaxed mb-3">{step.desc}</p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {tourSteps.map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === tourStep ? 'bg-green-400' : i < tourStep ? 'bg-green-400/40' : 'bg-white/20'}`} />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setTourStep(-1); localStorage.setItem('carro_som_tour_done', '1'); }}
                      className="px-3 py-1.5 text-[10px] text-white/40 hover:text-white/60 interactive rounded-lg hover:bg-white/[0.06]">
                      Pular
                    </button>
                    {tourStep < tourSteps.length - 1 ? (
                      <button onClick={() => setTourStep(tourStep + 1)}
                        className="px-3 py-1.5 text-[10px] font-bold bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 interactive border border-green-500/30">
                        Próximo →
                      </button>
                    ) : (
                      <button onClick={() => { setTourStep(-1); localStorage.setItem('carro_som_tour_done', '1'); }}
                        className="px-3 py-1.5 text-[10px] font-bold bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 interactive border border-green-500/30">
                        Concluir ✓
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Donation Modal */}
      <AnimatePresence>
        {showDonation && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowDonation(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="glass-strong rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto custom-scrollbar"
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-red-400" />
                  <h3 className="text-base font-bold text-white">Apoie o Projeto</h3>
                </div>
                <div className="flex items-center gap-2">
                  <a href="https://wa.me/5524974021588" target="_blank" rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-400 interactive" title="WhatsApp">
                    <MessageCircle className="w-4 h-4" />
                  </a>
                  <button onClick={() => setShowDonation(false)} className="p-1 rounded-lg hover:bg-white/10 text-white/40 interactive">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3 text-sm text-white/70 leading-relaxed">
                <p className="font-bold text-white/90">
                  Curtiu a ferramenta? 💡
                </p>
                <p>
                  Ela é — e continuará sendo — <span className="text-green-400 font-bold">100% gratuita</span>, independente de você apoiar ou não. Se ela está ajudando você a ganhar dinheiro, considere retribuir com um <span className="text-green-400 font-bold">Pix</span> (único ou mensal) do valor que você achar justo.
                </p>
                <p>
                  Esse reconhecimento é o que me motiva a dedicar tempo para criar novas funções e trazer vozes melhores. Apoie apenas se fizer sentido para você! 🚀
                </p>
              </div>

              {/* Pix */}
              <div className="bg-white/[0.04] border border-green-500/20 rounded-xl p-4 space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Chave Pix</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black/40 rounded-lg px-3 py-2 text-green-400 font-mono text-sm select-all">24974021588</code>
                  <button onClick={() => { navigator.clipboard.writeText('24974021588'); toast.success('Chave Pix copiada!'); }}
                    className="px-3 py-2 bg-green-500/20 border border-green-500/30 rounded-lg text-green-300 text-xs font-bold hover:bg-green-500/30 interactive">
                    Copiar
                  </button>
                </div>
              </div>

              {/* Community API Keys */}
              <div className="bg-white/[0.04] border border-purple-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">🔑 Chave de API Comunitária</p>
                  {communityKeyCount > 0 && (
                    <span className="text-[9px] bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full font-mono">{communityKeyCount} chave{communityKeyCount > 1 ? 's' : ''}</span>
                  )}
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  O sistema usa a API gratuita do Google Gemini para gerar vozes. Cada chave tem um <span className="text-yellow-400">limite de ~10 gerações por dia</span>. Quando uma chave esgota, o sistema tenta a próxima automaticamente.
                </p>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  <span className="text-white/70 font-semibold">Quanto mais chaves, mais forte a comunidade!</span> Contribua com sua chave gratuita e ajude todos a criar áudios sem parar:
                </p>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-white/40">1.</span>
                  <span className="text-white/60">Acesse</span>
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline underline-offset-2 interactive">
                    aistudio.google.com/apikey
                  </a>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-white/40">2.</span>
                  <span className="text-white/60">Crie uma chave gratuita (precisa de conta Google)</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-white/40">3.</span>
                  <span className="text-white/60">Cole abaixo e pronto — você ajuda toda a comunidade!</span>
                </div>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIza..."
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 font-mono focus:outline-none focus:border-purple-500/50 placeholder:text-white/15 interactive"
                  />
                  <button onClick={submitCommunityKey} disabled={isSubmittingKey || !apiKeyInput.trim()}
                    className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-purple-300 text-xs font-bold hover:bg-purple-500/30 disabled:opacity-30 interactive">
                    {isSubmittingKey ? '...' : 'Enviar'}
                  </button>
                </div>
              </div>

              <button onClick={() => setShowDonation(false)}
                className="w-full py-3 bg-gradient-to-r from-green-600 to-green-500 rounded-xl text-sm font-bold interactive shadow-lg shadow-green-900/20">
                Fechar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
