import React, { useState, useEffect, useRef } from 'react';
import { Phrase, SpeechRecognition, SpeechRecognitionErrorEvent } from '../types';
import MicrophoneIcon from './icons/MicrophoneIcon';
import CloseIcon from './icons/CloseIcon';

interface VoicePracticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (spokenText: string) => void;
  phrase: Phrase;
}

const VoicePracticeModal: React.FC<VoicePracticeModalProps> = ({ isOpen, onClose, onSubmit, phrase }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'de-DE';
    recognition.continuous = false;
    recognition.interimResults = true;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
        if (e.error !== 'aborted' && e.error !== 'no-speech') {
            console.error('Speech recognition error:', e.error);
        }
        setIsListening(false);
    };
    recognition.onresult = (event) => {
        const fullTranscript = Array.from(event.results).map(r => r[0].transcript).join('');
        setTranscript(fullTranscript);
        if (event.results[event.results.length - 1].isFinal) {
            if (fullTranscript.trim()) {
                onSubmit(fullTranscript.trim());
            } else {
                onClose(); // Close if nothing was said
            }
        }
    };
    recognitionRef.current = recognition;
  }, [onSubmit, onClose]);

  useEffect(() => {
    if (isOpen) {
        setTranscript('');
        try {
            // A small delay can help prevent 'not-allowed' errors on some browsers
            setTimeout(() => recognitionRef.current?.start(), 100);
        } catch(e) {
            console.error("Could not start recognition:", e);
        }
    } else {
        recognitionRef.current?.abort();
    }
    // Cleanup function to abort recognition when the component unmounts
    return () => recognitionRef.current?.abort();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex justify-center items-center backdrop-blur-sm p-4" onClick={onClose}>
        <div className="w-full max-w-lg min-h-[24rem] flex flex-col items-center justify-between p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
                <p className="text-slate-300">Произнесите перевод фразы:</p>
                <h2 className="text-3xl font-bold text-white mt-2">{phrase.russian}</h2>
            </div>

            <button
                type="button"
                onClick={() => recognitionRef.current?.start()}
                aria-label="Запись голоса"
                className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-purple-500/50 ${isListening ? 'listening-glow' : 'bg-slate-700 hover:bg-slate-600'}`}
            >
                <MicrophoneIcon className="w-14 h-14 text-white" />
            </button>

            <div className="h-10 text-center">
                <p className="text-slate-200 text-lg">{transcript || (isListening ? 'Слушаю...' : ' ')}</p>
            </div>

            <button onClick={onClose} className="p-3 rounded-full bg-slate-600/50 hover:bg-slate-700 transition-colors" aria-label="Закрыть">
                <CloseIcon className="w-6 h-6 text-slate-200"/>
            </button>
        </div>
    </div>
  );
};

export default VoicePracticeModal;
