import React, { useState, useEffect } from 'react';
import type { Phrase, VerbConjugation, TenseForms, PronounConjugation } from '../types';
import CloseIcon from './icons/CloseIcon';
import TableIcon from './icons/TableIcon';
import AudioPlayer from './AudioPlayer';
import Spinner from './Spinner';

interface VerbConjugationModalProps {
  isOpen: boolean;
  onClose: () => void;
  infinitive: string;
  onConjugateSimple: (infinitive: string) => Promise<{ pronoun: string; form: string }[]>;
  onConjugateDetailed: (infinitive: string) => Promise<VerbConjugation>;
  onOpenWordAnalysis: (phrase: Phrase, word: string) => void;
}

const SimpleSkeleton: React.FC = () => (
    <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700/50 animate-pulse">
        <div className="p-4 bg-slate-800/50">
            <div className="h-6 w-1/2 bg-slate-700 rounded"></div>
        </div>
        <div className="p-4 space-y-4">
            {[...Array(6)].map((_, j) => (
                <div key={j} className="flex items-center space-x-3">
                    <div className="h-5 w-16 bg-slate-700 rounded"></div>
                    <div className="flex-grow h-4 bg-slate-700 rounded w-5/6"></div>
                    <div className="h-8 w-8 bg-slate-700 rounded-full"></div>
                </div>
            ))}
        </div>
    </div>
);


const VerbConjugationSkeleton: React.FC = () => (
    <div className="space-y-6 animate-pulse">
        {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-slate-900/50 rounded-lg overflow-hidden">
                <div className="p-4">
                    <div className="h-6 w-1/2 bg-slate-700 rounded"></div>
                </div>
                <div className="px-4 flex space-x-4 border-b border-slate-700">
                    <div className="h-9 w-28 bg-slate-700/50"></div>
                    <div className="h-9 w-20 bg-slate-700/50"></div>
                </div>
                <div className="p-4 space-y-4">
                    {[...Array(4)].map((_, j) => (
                        <div key={j} className="flex items-center space-x-3">
                            <div className="h-5 w-16 bg-slate-700 rounded"></div>
                            <div className="flex-grow space-y-1">
                                <div className="h-4 bg-slate-700 rounded w-5/6"></div>
                                <div className="h-3 bg-slate-700 rounded w-3/4"></div>
                            </div>
                            <div className="h-8 w-8 bg-slate-700 rounded-full"></div>
                        </div>
                    ))}
                </div>
            </div>
        ))}
    </div>
);


const VerbConjugationModal: React.FC<VerbConjugationModalProps> = ({ isOpen, onClose, infinitive, onConjugateSimple, onConjugateDetailed, onOpenWordAnalysis }) => {
  type SimpleConjugation = { pronoun: string; form: string };
  const [simpleData, setSimpleData] = useState<SimpleConjugation[] | null>(null);
  const [detailedData, setDetailedData] = useState<VerbConjugation | null>(null);
  const [isDetailedView, setIsDetailedView] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTabs, setActiveTabs] = useState({
    present: 'statement' as keyof TenseForms,
    past: 'statement' as keyof TenseForms,
    future: 'statement' as keyof TenseForms,
  });

  useEffect(() => {
    if (!isOpen) {
        setTimeout(() => {
            setSimpleData(null);
            setDetailedData(null);
            setIsDetailedView(false);
            setError(null);
        }, 300); // after close animation
        return;
    };

    const fetchSimple = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await onConjugateSimple(infinitive);
            setSimpleData(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить простое спряжение.');
        } finally {
            setIsLoading(false);
        }
    };

    fetchSimple();
  }, [isOpen, infinitive, onConjugateSimple]);

  const handleShowDetails = async () => {
    setIsDetailedView(true);
    if (detailedData) return; // already fetched

    setIsLoading(true);
    setError(null);
    try {
        const data = await onConjugateDetailed(infinitive);
        setDetailedData(data);
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить подробное спряжение.');
    } finally {
        setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleWordClick = (contextText: string, word: string) => {
    // FIX: Updated proxy phrase creation to match the new `Phrase` type.
    const proxyPhrase: Omit<Phrase, 'id'> & { id?: string } = {
        id: `proxy_verb_${infinitive}`,
        text: { learning: contextText, native: `Спряжение: ${infinitive}` },
        category: 'general',
        masteryLevel: 0, lastReviewedAt: null, nextReviewAt: Date.now(),
        knowCount: 0, knowStreak: 0, isMastered: false,
        lapses: 0,
    };
    onOpenWordAnalysis(proxyPhrase as Phrase, word);
  };
  
  const renderClickableGerman = (text: string) => {
      if (!text) return null;
      return text.split(' ').map((word, i, arr) => (
          <span
              key={i}
              onClick={(e) => {
                  e.stopPropagation();
                  const cleanedWord = word.replace(/[.,!?()"“”:;]/g, '');
                  if (cleanedWord) handleWordClick(text, cleanedWord);
              }}
              className="cursor-pointer hover:bg-white/20 px-1 py-0.5 rounded-md transition-colors"
          >
              {word}{i < arr.length - 1 ? ' ' : ''}
          </span>
      ));
  };

  const renderSimpleView = () => (
    <>
      <section className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700/50">
        <h3 className="text-xl font-bold text-slate-100 p-4 bg-slate-800/50">Präsens (Настоящее)</h3>
        <div className="p-4 space-y-3">
          {simpleData!.map((conj) => (
            <div key={conj.pronoun} className="grid grid-cols-[80px_1fr_auto] items-center gap-x-3 text-sm">
                <span className="font-mono text-purple-300 text-right">{conj.pronoun}</span>
                <p className="text-slate-100 font-medium truncate">{renderClickableGerman(conj.form)}</p>
                <AudioPlayer textToSpeak={conj.form} />
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 text-center">
        <button
            onClick={handleShowDetails}
            className="px-6 py-2 rounded-md bg-slate-600 hover:bg-slate-700 text-white font-semibold transition-colors"
        >
            Подробнее
        </button>
      </div>
    </>
  );

  
  const renderTenseSection = (tenseKey: 'present' | 'past' | 'future', title: string) => {
    if (!detailedData) return null;
    const tenseData = detailedData[tenseKey];
    if (!tenseData) return null;

    const forms: { key: keyof TenseForms; name: string }[] = [
      { key: 'statement', name: 'Утверждение' },
      { key: 'question', name: 'Вопрос' },
      { key: 'negative', name: 'Отрицание' },
    ];
    
    const activeTab = activeTabs[tenseKey];
    const cellData = tenseData[activeTab];
    
    return (
      <section className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700/50">
        <h3 className="text-xl font-bold text-slate-100 p-4 bg-slate-800/50">{title}</h3>
        <div className="flex border-b border-slate-700 px-4">
          {forms.map(form => (
            <button
              key={form.key}
              onClick={() => setActiveTabs(prev => ({ ...prev, [tenseKey]: form.key }))}
              className={`px-3 sm:px-4 py-2 text-sm font-semibold transition-colors focus:outline-none -mb-px ${
                activeTab === form.key
                  ? 'border-b-2 border-purple-400 text-purple-300'
                  : 'text-slate-400 hover:text-slate-200 border-b-2 border-transparent'
              }`}
            >
              {form.name}
            </button>
          ))}
        </div>
        <div className="p-4 space-y-3">
          {cellData?.map((conj: PronounConjugation) => (
            <div key={conj.pronoun} className="grid grid-cols-[80px_1fr_auto] items-center gap-x-3 text-sm">
                <span className="font-mono text-purple-300 text-right">{conj.pronoun}</span>
                <div className="min-w-0">
                    <p className="text-slate-100 font-medium truncate">{renderClickableGerman((conj as any).german)}</p>
                    <p className="text-xs text-slate-400 italic truncate">«{(conj as any).russian}»</p>
                </div>
                <AudioPlayer textToSpeak={(conj as any).german} />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderDetailedView = () => {
      if (isLoading && !detailedData) return <VerbConjugationSkeleton />;
      if (!detailedData) return null; // Or some other state
      return (
        <div className="space-y-6">
            {renderTenseSection('present', 'Präsens (Настоящее)')}
            {renderTenseSection('past', 'Perfekt (Прошедшее)')}
            {renderTenseSection('future', 'Futur I (Будущее)')}
        </div>
      );
  }

  const renderContent = () => {
    if (isLoading && !simpleData && !detailedData) return <SimpleSkeleton />;
    if (error) return <div className="flex justify-center items-center h-full"><div className="text-center bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg"><p className="font-semibold">Ошибка</p><p className="text-sm">{error}</p></div></div>;
    
    if (isDetailedView) return renderDetailedView();
    if (simpleData) return renderSimpleView();

    return <SimpleSkeleton />;
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex justify-center items-center p-4" onClick={onClose}>
      <div 
        className="bg-slate-800 w-full max-w-3xl m-4 rounded-2xl shadow-2xl flex flex-col h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <TableIcon className="w-6 h-6 text-purple-400"/>
            <h2 className="text-lg font-bold text-slate-100">Спряжение: {infinitive}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700">
            <CloseIcon className="w-6 h-6 text-slate-400"/>
          </button>
        </header>
        <div className="p-4 sm:p-6 flex-grow overflow-y-auto hide-scrollbar">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default VerbConjugationModal;