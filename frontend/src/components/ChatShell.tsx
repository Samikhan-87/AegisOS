import React, { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { askRAGAgent } from '../services/api';
import type { Citation, RAGAskPayload } from '../services/api';
import {
  Home,
  LayoutGrid,
  Compass,
  History,
  Database,
  Search,
  Paperclip,
  Globe,
  Sparkles,
  Mic,
  Volume2,
  Send,
  MoreHorizontal,
  ChevronDown,
  Cpu,
  ShieldCheck,
  Lock,
  Activity,
  FileText,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  Filter,
  Sun,
  Moon,
  RefreshCw,
  Menu,
  X,
  Bot
} from 'lucide-react';

interface ExecutionStep {
  step: string;
  agent: string;
  latencyMs: number;
  status: 'completed' | 'active' | 'pending';
}

interface KnowledgeSource {
  title: string;
  department: string;
  chunkIndex: number;
  score: number;
  text: string;
}

interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  reasoningSummary?: string;
  executionTrail?: ExecutionStep[];
  sources?: KnowledgeSource[];
  citations?: Citation[];
  observability?: {
    latencyMs: number;
    totalTokens: number;
    embeddingDim: number;
    preFilterApplied: boolean;
    department: string;
    mode?: string;
  };
}

interface Agent {
  id: string;
  name: string;
  role: string;
  badge: string;
  icon: React.ElementType;
  description: string;
}

const AGENTS: Agent[] = [
  {
    id: 'core',
    name: 'Aegis Core Agent',
    role: 'Orchestration & Decision Layer',
    badge: 'ROUTER',
    icon: Cpu,
    description: 'Central intent classification, workflow routing, and multi-agent coordination engine.'
  },
  {
    id: 'rag',
    name: 'RAG Retriever',
    role: 'ChromaDB Knowledge Base & Search',
    badge: 'VECTOR_STORE',
    icon: Database,
    description: 'Retrieves semantically relevant document chunks using ChromaDB native pre-filtering.'
  },
  {
    id: 'security',
    name: 'Security Auditor',
    role: 'Validation & Guardrails Engine',
    badge: 'VALIDATOR',
    icon: ShieldCheck,
    description: 'Enforces policy compliance, PII masking, data boundary checks, and audit trails.'
  },
  {
    id: 'compliance',
    name: 'Compliance Specialist',
    role: 'Regulatory & Corporate Governance',
    badge: 'AUDITOR',
    icon: Lock,
    description: 'Validates queries against GDPR, AML, KYC, and internal corporate compliance policies.'
  }
];

const DEPARTMENTS = [
  'ALL',
  'AI Governance',
  'Banking Operations',
  'Compliance',
  'Customer Support Department',
  'Disaster Recovery',
  'Finance',
  'HR',
  'IT & Engineering',
  'Security'
];

interface CustomSelectProps {
  options: { label: string; value: string; icon?: React.ElementType }[];
  value: string;
  onChange: (val: string) => void;
  icon?: React.ElementType;
  prefixLabel?: string;
}

function CustomSelect({ options, value, onChange, icon: Icon, prefixLabel }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center space-x-2 bg-white dark:bg-[#151722] hover:bg-slate-50 dark:hover:bg-[#1A1D2B] border border-slate-200 dark:border-[#232636] px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 transition-all shadow-xs"
      >
        {Icon && <Icon className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />}
        {prefixLabel && <span className="text-slate-500 dark:text-slate-400 font-normal">{prefixLabel}:</span>}
        <span className="truncate max-w-[140px] sm:max-w-[180px]">{selectedOption.label}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180 text-sky-500 dark:text-sky-400' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-56 rounded-2xl bg-white dark:bg-[#181a26] border border-slate-200 dark:border-[#2A2E44] shadow-2xl p-1.5 z-50 space-y-1">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            const OptIcon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-between transition-all ${
                  isSelected
                    ? 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold border border-sky-200 dark:border-sky-500/30'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#25293E]'
                }`}
              >
                <div className="flex items-center space-x-2.5 truncate">
                  {OptIcon && <OptIcon className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />}
                  <span className="truncate">{opt.label}</span>
                </div>
                {isSelected && <div className="w-2 h-2 rounded-full bg-sky-500 dark:bg-cyan-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChatShell() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [selectedAgent, setSelectedAgent] = useState<Agent>(AGENTS[0]);
  const [activeDepartment, setActiveDepartment] = useState<string>('ALL');
  const [searchMode, setSearchMode] = useState<'hybrid' | 'vector' | 'bm25'>('hybrid');
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loadingStepText, setLoadingStepText] = useState('Searching ChromaDB vectors & BM25 keyword index...');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStats, setIngestStats] = useState<{
    totalDocs: number;
    totalChunks: number;
  } | null>(null);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // React Query useMutation hook for RAG Agent POST API call
  const ragMutation = useMutation({
    mutationFn: (payload: RAGAskPayload) => askRAGAgent(payload),
    onMutate: (variables) => {
      // Create user message in chat thread
      const userMsg: Message = {
        id: Date.now().toString(),
        sender: 'user',
        text: variables.query,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        agentId: 'user',
        agentName: 'User'
      };
      setMessages((prev) => [...prev, userMsg]);
    },
    onSuccess: (data, variables) => {
      const sources: KnowledgeSource[] = (data.retrieved_chunks || []).map((item: any) => ({
        title: item.metadata?.source_filename || item.metadata?.filename || 'Document.pdf',
        department: item.metadata?.department || 'General',
        chunkIndex: item.metadata?.chunk_index ?? 0,
        score: item.fused_rrf_score || item.similarity_score || item.bm25_score || 0.9,
        text: item.text
      }));

      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'agent',
        text: data.answer || "No response generated.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        reasoningSummary: `Executed LangGraph RAG Agent (Hybrid Retrieval + Grounded Ollama LLM). Scope: [${variables.department_filter || 'ALL'}].`,
        executionTrail: [
          { step: 'Hybrid Retrieval (BM25 + Vector)', agent: 'RAG Retriever', latencyMs: 140, status: 'completed' },
          { step: 'Grounded LLM Answer (Ollama)', agent: 'Ollama LLM', latencyMs: 820, status: 'completed' }
        ],
        sources,
        citations: data.citations || [],
        observability: {
          latencyMs: 968,
          totalTokens: Math.round(variables.query.length / 4) + 240,
          embeddingDim: 384,
          preFilterApplied: !!variables.department_filter,
          department: variables.department_filter || 'ALL',
          mode: searchMode
        }
      };

      setMessages((prev) => [...prev, agentMsg]);
    },
    onError: (error: any) => {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'agent',
        text: error.message || 'Something went wrong reaching the RAG agent — check that the backend and Ollama are running.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        sources: []
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  });

  const isProcessing = ragMutation.isPending;

  useEffect(() => {
    if (chatScrollContainerRef.current) {
      const container = chatScrollContainerRef.current;
      if (container.scrollHeight > container.clientHeight) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages, isProcessing]);

  useEffect(() => {
    if (isProcessing) {
      const steps = [
        'Searching ChromaDB vectors & BM25 keyword index...',
        'Synthesizing grounded context from top retrieved chunks...',
        'Generating response with Ollama LLM...'
      ];
      let stepIndex = 0;
      setLoadingStepText(steps[0]);

      const interval = setInterval(() => {
        stepIndex = (stepIndex + 1) % steps.length;
        setLoadingStepText(steps[stepIndex]);
      }, 3500);

      return () => clearInterval(interval);
    }
  }, [isProcessing]);

  const handleSendMessage = (customText?: string) => {
    const textToSend = customText || inputMessage;
    if (!textToSend.trim() || isProcessing) return;

    const departmentFilter = activeDepartment === 'ALL' ? undefined : activeDepartment;

    ragMutation.mutate({
      query: textToSend.trim(),
      department_filter: departmentFilter
    });

    if (!customText) {
      setInputMessage('');
    }
  };

  const handleBatchIngest = async () => {
    if (isIngesting) return;
    setIsIngesting(true);
    try {
      const res = await fetch('/api/v1/documents/ingest-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setIngestStats({
          totalDocs: data.total_documents_processed,
          totalChunks: data.total_chunks_stored
        });
      }
    } catch (e) {
      console.error('Ingest error:', e);
    } finally {
      setIsIngesting(false);
    }
  };

  const toggleSourceExpand = (messageId: string) => {
    setExpandedSources((prev) => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  const SelectedAgentIcon = selectedAgent.icon;

  const agentSelectOptions = AGENTS.map((a) => ({
    label: a.name,
    value: a.id,
    icon: a.icon
  }));

  const departmentSelectOptions = DEPARTMENTS.map((d) => ({
    label: d,
    value: d
  }));

  const modeSelectOptions = [
    { label: 'Hybrid (RRF)', value: 'hybrid' },
    { label: 'Vector Only', value: 'vector' },
    { label: 'BM25 Only', value: 'bm25' }
  ];

  return (
    <div className="flex h-dvh w-screen bg-[#F4F6FB] dark:bg-[#0C0D12] text-slate-900 dark:text-slate-100 font-sans select-none overflow-hidden relative">
      
      {/* ========================================================================= */}
      {/* 1. SIDEBAR */}
      {/* ========================================================================= */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 w-64 sm:w-72 bg-[#F8FAFC] dark:bg-[#0A0B0F] border-r border-slate-200/80 dark:border-[#1B1D28] flex flex-col justify-between z-40 transition-transform duration-300 transform ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } shrink-0 p-5`}
      >
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-2.5">
              <div className="iridescent-orb-sm shadow-md" />
              <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">Aegis OS</span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={toggleTheme}
                title="Toggle Theme"
                className="p-2 rounded-xl border border-slate-200 dark:border-[#232636] bg-slate-100 dark:bg-[#141620] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-500" />}
              </button>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="md:hidden p-2 rounded-xl border border-slate-200 dark:border-[#232636] bg-slate-100 dark:bg-[#141620] text-slate-600 dark:text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search Chats Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search chats..."
              className="w-full bg-white dark:bg-[#141620] border border-slate-200 dark:border-[#232636] rounded-xl pl-10 pr-9 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500/60 font-medium shadow-xs"
            />
            <span className="absolute right-3 top-2 text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#1E202C] px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#2A2D3D]">
              ⌘K
            </span>
          </div>

          {/* Core Navigation Links */}
          <nav className="space-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-semibold">
            <button className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sky-800 dark:text-slate-100 bg-sky-500/10 dark:bg-[#171924] border border-sky-500/20 dark:border-[#252838] shadow-xs">
              <Home className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              <span>Home</span>
            </button>
            <button className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#141620] transition-colors">
              <LayoutGrid className="w-4 h-4 text-slate-400" />
              <span>Templates</span>
            </button>
            <button className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#141620] transition-colors">
              <Compass className="w-4 h-4 text-slate-400" />
              <span>Explore</span>
            </button>
            <button className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#141620] transition-colors">
              <History className="w-4 h-4 text-slate-400" />
              <span>History</span>
            </button>
            <button className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#141620] transition-colors">
              <Database className="w-4 h-4 text-slate-400" />
              <span>Vector Store</span>
            </button>
          </nav>

          {/* Time-Based Recent Operations List */}
          <div className="space-y-4 pt-2 border-t border-slate-200/80 dark:border-[#1A1C28]">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono px-3 mb-2">Tomorrow</div>
              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
                <div className="px-3 py-1.5 truncate hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#141620] rounded-lg cursor-pointer">What's one lesson life has taught...</div>
                <div className="px-3 py-1.5 truncate hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#141620] rounded-lg cursor-pointer">Security Audit Compliance Directive...</div>
                <div className="px-3 py-1.5 truncate hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#141620] rounded-lg cursor-pointer">GDPR Data Retention Schedule...</div>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono px-3 mb-2">10 days Ago</div>
              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
                <div className="px-3 py-1.5 truncate hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#141620] rounded-lg cursor-pointer">Disaster Recovery BCP Plan...</div>
                <div className="px-3 py-1.5 truncate hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#141620] rounded-lg cursor-pointer">Responsible AI Prompt Policy...</div>
              </div>
            </div>
          </div>
        </div>

        {/* User Profile Footer */}
        <div className="pt-3 border-t border-slate-200/80 dark:border-[#1B1D28] flex items-center justify-between px-1">
          <div className="flex items-center space-x-2.5 truncate">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-sky-600 flex items-center justify-center font-bold text-white text-xs shadow-md">
              JM
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">Aegis Admin</div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Enterprise Plan</div>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </div>
      </aside>

      {/* Backdrop overlay for mobile drawer */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-xs"
        />
      )}

      {/* ========================================================================= */}
      {/* 2. MAIN WORKSPACE (UNIFIED CONTINUOUS CHAT SCREEN) */}
      {/* ========================================================================= */}
      <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden relative bg-[#F4F6FB] dark:bg-[#0C0D12] z-10">
        
        {/* AMBIENT BOTTOM GLOW BACKDROP */}
        <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[45rem] h-[22rem] bg-gradient-to-t from-sky-400/20 via-cyan-300/10 to-transparent dark:from-sky-500/20 dark:via-cyan-500/10 rounded-full blur-[130px] pointer-events-none z-0" />

        {/* Fixed Top Header Bar */}
        <header className="h-16 shrink-0 px-4 sm:px-6 flex items-center justify-between border-b border-slate-200/80 dark:border-[#1A1C28] bg-[#F4F6FB]/90 dark:bg-[#0C0D12]/90 backdrop-blur-md z-30 overflow-visible">
          <div className="flex items-center space-x-2 sm:space-x-3 overflow-visible py-1">

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden p-2 rounded-xl border border-slate-200 dark:border-[#232636] bg-white dark:bg-[#151722] text-slate-700 dark:text-slate-300"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Custom Popover Dropdowns */}
            <CustomSelect
              options={agentSelectOptions}
              value={selectedAgent.id}
              onChange={(id) => {
                const found = AGENTS.find((a) => a.id === id);
                if (found) setSelectedAgent(found);
              }}
              icon={SelectedAgentIcon}
            />

            <CustomSelect
              options={departmentSelectOptions}
              value={activeDepartment}
              onChange={setActiveDepartment}
              icon={Filter}
              prefixLabel="Filter"
            />

            <CustomSelect
              options={modeSelectOptions}
              value={searchMode}
              onChange={(m) => setSearchMode(m as any)}
              prefixLabel="Mode"
            />
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setInspectorOpen(!inspectorOpen)}
              className={`p-2 rounded-xl border text-xs transition-colors flex items-center space-x-1 font-semibold ${
                inspectorOpen ? 'bg-sky-50 dark:bg-[#1D2030] border-sky-300 dark:border-sky-500/50 text-sky-600 dark:text-sky-400' : 'bg-white dark:bg-[#151722] border-slate-200 dark:border-[#232636] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {inspectorOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
            <button className="p-2 rounded-xl border border-slate-200 dark:border-[#232636] bg-white dark:bg-[#151722] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* WORKSPACE BODY */}
        {messages.length === 0 ? (
          /* INITIAL WELCOME SCREEN */
          <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 flex flex-col justify-between items-center z-10">
            <div className="max-w-3xl w-full my-auto text-center space-y-6 py-4">
              
              {/* 3D Iridescent Light Blue Sphere */}
              <div className="flex justify-center relative">
                <div className="w-48 h-48 bg-sky-400/20 dark:bg-sky-500/20 rounded-full blur-[70px] absolute -top-6 left-1/2 -translate-x-1/2 pointer-events-none" />
                <div className="iridescent-orb animate-pulse relative z-10" />
              </div>

              {/* Headings */}
              <div className="space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-medium text-slate-900 dark:text-slate-100 tracking-tight">
                  Good Evening, Aegis AI.
                </h1>
                <h2 className="text-xl sm:text-2xl font-medium text-slate-700 dark:text-slate-200 tracking-tight">
                  Can I help you with anything ?
                </h2>
              </div>

              {/* Centered Floating Input Card */}
              <div className="bg-white dark:bg-[#151722] border border-slate-200/80 dark:border-[#232636] rounded-2xl p-4 sm:p-5 text-left space-y-3.5 shadow-xl relative z-10">
                <textarea
                  rows={2}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Message AI Chat..."
                  className="w-full bg-transparent text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none font-medium"
                />

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleBatchIngest}
                      disabled={isIngesting}
                      title="Batch Ingest PDFs (/ingest-all)"
                      className="p-2 rounded-xl bg-slate-100 dark:bg-[#1D2030] hover:bg-slate-200 dark:hover:bg-[#25293E] border border-slate-200 dark:border-[#2A2E44] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
                    >
                      {isIngesting ? <RefreshCw className="w-4 h-4 animate-spin text-sky-500 dark:text-sky-400" /> : <Paperclip className="w-4 h-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSendMessage('Search compliance & customer privacy rules')}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#1D2030] hover:bg-slate-200 dark:hover:bg-[#25293E] border border-slate-200 dark:border-[#2A2E44] text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center space-x-1.5 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                      <span>RAG Hybrid Search</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSendMessage('Who is the document owner for AB-AI-004?')}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#1D2030] hover:bg-slate-200 dark:hover:bg-[#25293E] border border-slate-200 dark:border-[#2A2E44] text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center space-x-1.5 transition-colors hidden sm:flex"
                    >
                      <Globe className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span>Ask Ollama RAG</span>
                    </button>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button type="button" className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                      <Mic className="w-4 h-4" />
                    </button>
                    <button type="button" className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                      <Volume2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendMessage()}
                      disabled={!inputMessage.trim() || isProcessing}
                      className="p-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-bold transition-colors shadow-md"
                    >
                      <Send className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 3 Grid Action Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 pt-1 relative z-10">
                <button
                  onClick={() => handleSendMessage('Who is the document owner for AB-AI-004?')}
                  className="bg-white dark:bg-[#151722] hover:bg-slate-50 dark:hover:bg-[#1A1D2B] border border-slate-200 dark:border-[#232636] hover:border-sky-500/40 rounded-2xl p-4 text-left transition-all space-y-1.5 shadow-md"
                >
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Smart RAG Agent</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                    Queries local Ollama LLM with hybrid RRF retrieval & grounded document citations.
                  </div>
                </button>

                <button
                  onClick={() => handleSendMessage('What is the Business Continuity Plan for Disaster Recovery?')}
                  className="bg-white dark:bg-[#151722] hover:bg-slate-50 dark:hover:bg-[#1A1D2B] border border-slate-200 dark:border-[#232636] hover:border-sky-500/40 rounded-2xl p-4 text-left transition-all space-y-1.5 shadow-md"
                >
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Security Audit</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                    Evaluates system directives against PII boundaries and corporate incident plans.
                  </div>
                </button>

                <button
                  onClick={() => handleSendMessage('What are the Responsible AI & LLM Security Guidelines?')}
                  className="bg-white dark:bg-[#151722] hover:bg-slate-50 dark:hover:bg-[#1A1D2B] border border-slate-200 dark:border-[#232636] hover:border-sky-500/40 rounded-2xl p-4 text-left transition-all sm:col-span-2 md:col-span-1 shadow-md"
                >
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Compliance Scope</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                    Enforces pre-filtering over 9 corporate departments without cross-leaks.
                  </div>
                </button>
              </div>

            </div>
          </div>
        ) : (
          /* ACTIVE CHAT VIEW: SEAMLESS CONTINUOUS CHAT SCREEN */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative z-10">
            
            {/* Scrollable Messages Stream */}
            <div ref={chatScrollContainerRef} className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 pt-4 space-y-5">
              <div className="max-w-3xl mx-auto w-full space-y-5">
                {messages.map((msg) => (
                  <div key={msg.id} className="space-y-3">
                    {msg.sender === 'user' ? (
                      /* User Message Row */
                      <div className="flex items-start justify-end space-x-3">
                        <div className="max-w-xl bg-gradient-to-r from-sky-600 to-cyan-600 text-white px-5 py-3 rounded-2xl shadow-md text-sm leading-relaxed font-medium">
                          {msg.text}
                        </div>
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-sky-600 flex items-center justify-center font-bold text-white text-xs shadow-md shrink-0 mt-0.5">
                          JM
                        </div>
                      </div>
                    ) : (
                      /* AI Agent Response Row */
                      <div className="flex items-start space-x-3">
                        <div className="iridescent-orb-sm shadow-lg shadow-sky-500/30 mt-1" />

                        <div className="flex-1 bg-white dark:bg-[#151722] border border-slate-200 dark:border-[#232636] rounded-2xl p-5 space-y-3.5 shadow-md">
                          <div className="flex items-center justify-between text-xs border-b border-slate-200/80 dark:border-[#202330] pb-3">
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                              <span className="font-bold text-slate-900 dark:text-slate-100">{msg.agentName}</span>
                              <span className="text-[10px] font-mono bg-sky-50 dark:bg-[#1E2130] text-sky-700 dark:text-sky-400 px-2 py-0.5 rounded border border-sky-200 dark:border-[#2A2E44] font-semibold">
                                {searchMode.toUpperCase()}
                              </span>
                            </div>
                            <span className="text-slate-500 dark:text-slate-400 font-mono text-xs">{msg.timestamp}</span>
                          </div>

                          {/* Execution Trail */}
                          {msg.executionTrail && (
                            <div className="flex items-center space-x-2 text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-100/80 dark:bg-[#0E1017] p-2.5 rounded-xl overflow-x-auto border border-slate-200/60 dark:border-transparent">
                              <span className="text-slate-500 font-bold shrink-0">TRAIL:</span>
                              {msg.executionTrail.map((step, idx) => (
                                <React.Fragment key={idx}>
                                  <span className="text-slate-800 dark:text-slate-200 bg-white dark:bg-[#171926] border border-slate-200 dark:border-transparent px-2 py-0.5 rounded shrink-0 font-medium">
                                    {step.agent} ({step.latencyMs}ms)
                                  </span>
                                  {idx < msg.executionTrail!.length - 1 && (
                                    <ChevronRight className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 shrink-0" />
                                  )}
                                </React.Fragment>
                              ))}
                            </div>
                          )}

                          <div className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap font-normal">
                            {msg.text}
                          </div>

                          {/* Citations Block */}
                          {msg.citations && msg.citations.length > 0 && (
                            <div className="pt-2.5 border-t border-slate-200/80 dark:border-[#202330]/80 space-y-1.5">
                              <div className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                                <FileText className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                                <span>Sources / Citations:</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {Array.from(new Set(msg.citations.map((c) => `${c.filename}|${c.department}`))).map((key) => {
                                  const [filename, department] = key.split('|');
                                  return (
                                    <span
                                      key={key}
                                      className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-sky-50/80 dark:bg-[#0E1017] border border-sky-200/80 dark:border-[#202330] text-[11px] font-mono text-slate-700 dark:text-slate-300 font-medium shadow-xs"
                                    >
                                      <span className="text-sky-700 dark:text-cyan-300 font-extrabold">{filename}</span>
                                      <span className="text-slate-400 dark:text-slate-500">•</span>
                                      <span className="text-slate-600 dark:text-slate-400">{department}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Retrieved Knowledge Sources */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="pt-2 border-t border-slate-200/80 dark:border-[#202330] space-y-2">
                              <button
                                onClick={() => toggleSourceExpand(msg.id)}
                                className="flex items-center justify-between w-full text-xs font-mono text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-bold"
                              >
                                <span className="flex items-center space-x-1.5">
                                  <Database className="w-3.5 h-3.5" />
                                  <span>
                                    RETRIEVED SOURCES ({msg.sources.length} CHUNKS - FILTER: {msg.observability?.department})
                                  </span>
                                </span>
                                {expandedSources[msg.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>

                              {expandedSources[msg.id] && (
                                <div className="space-y-2 pt-1">
                                  {msg.sources.map((src, idx) => (
                                    <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-[#0E1017] border border-slate-200 dark:border-[#202330] text-xs font-mono space-y-1 shadow-xs">
                                      <div className="flex justify-between text-slate-700 dark:text-slate-300">
                                        <span className="font-bold text-sky-800 dark:text-cyan-200 flex items-center gap-1.5 text-xs">
                                          <FileText className="w-3.5 h-3.5 text-sky-500 dark:text-cyan-400" />
                                          {src.title}
                                        </span>
                                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                          SCORE: {src.score}
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                        DEPT: {src.department} | CHUNK: {src.chunkIndex}
                                      </div>
                                      <p className="text-slate-800 dark:text-slate-300 font-sans text-xs pt-0.5 leading-relaxed">
                                        "{src.text}"
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* SINGLE PERSISTENT COMPACT PROCESSING CONTAINER */}
                {isProcessing && (
                  <div className="flex items-start space-x-3 transition-opacity duration-200">
                    <div className="iridescent-orb-sm shadow-lg shadow-sky-500/30 mt-1" />
                    <div className="flex-1 bg-white dark:bg-[#151722] border border-slate-200 dark:border-[#232636] rounded-2xl p-3.5 space-y-2 shadow-md">
                      <div className="flex items-center justify-between text-xs border-b border-slate-200/80 dark:border-[#202330] pb-2">
                        <div className="flex items-center space-x-2">
                          <Bot className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                          <span className="font-bold text-slate-900 dark:text-slate-100">{selectedAgent.name}</span>
                          <span className="text-[10px] font-mono bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-500/30 font-semibold animate-pulse">
                            THINKING...
                          </span>
                        </div>
                        <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin text-sky-500 dark:text-sky-400" />
                          Ollama (qwen2.5:3b)
                        </span>
                      </div>

                      <div className="flex items-center space-x-2.5 text-xs text-sky-700 dark:text-sky-300 font-mono font-medium">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 animate-spin shrink-0" />
                        <span className="truncate">{loadingStepText}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* SEAMLESS FLOATING COMPOSER */}
            <div className="shrink-0 px-4 sm:px-6 pt-2 pb-4 sm:pb-5">
              <div className="max-w-3xl mx-auto w-full">
                <div className="bg-white dark:bg-[#151722] border border-slate-200 dark:border-[#232636] rounded-2xl p-3.5 text-left space-y-2.5 shadow-xl">
                  <textarea
                    rows={2}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Message AI Chat..."
                    className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none font-medium"
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={handleBatchIngest}
                        disabled={isIngesting}
                        className="p-1.5 rounded-xl bg-slate-100 dark:bg-[#1D2030] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-50"
                      >
                        {isIngesting ? <RefreshCw className="w-4 h-4 animate-spin text-sky-500 dark:text-sky-400" /> : <Paperclip className="w-4 h-4" />}
                      </button>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-medium truncate max-w-[200px] sm:max-w-none">
                        Filter: {activeDepartment} | Mode: {searchMode}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSendMessage()}
                      disabled={!inputMessage.trim() || isProcessing}
                      className="p-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-bold transition-colors shadow-md"
                    >
                      <Send className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* ========================================================================= */}
      {/* 3. RIGHT OBSERVABILITY DRAWER */}
      {/* ========================================================================= */}
      {inspectorOpen && (
        <aside className="w-72 sm:w-80 bg-[#F8FAFC] dark:bg-[#0A0B0F] border-l border-slate-200/80 dark:border-[#1B1D28] flex flex-col justify-between z-20 shrink-0 p-5 text-xs font-mono">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-[#1B1D28] pb-3">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-500 dark:text-sky-400" /> OBSERVABILITY
              </span>
              <button onClick={() => setInspectorOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                <PanelRightClose className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Pipeline Metrics</div>
              <div className="p-3.5 rounded-xl bg-white dark:bg-[#141620] border border-slate-200 dark:border-[#202330] space-y-1.5 shadow-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Search Mode:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">{searchMode.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Pre-Filter:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold">{activeDepartment}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Vector Store:</span>
                  <span className="text-slate-800 dark:text-slate-200">ChromaDB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">LLM Engine:</span>
                  <span className="text-sky-600 dark:text-sky-400 font-semibold">Ollama (qwen2.5)</span>
                </div>
              </div>

              {ingestStats && (
                <div className="p-3.5 rounded-xl bg-white dark:bg-[#141620] border border-slate-200 dark:border-[#202330] space-y-1.5 shadow-xs">
                  <div className="text-slate-800 dark:text-slate-200 font-bold">Indexed Corpus</div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Processed Files:</span>
                    <span className="text-slate-800 dark:text-slate-200 font-semibold">{ingestStats.totalDocs} PDFs</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Indexed Chunks:</span>
                    <span className="text-sky-600 dark:text-sky-400 font-bold">{ingestStats.totalChunks} vectors</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200/80 dark:border-[#1B1D28] text-slate-500 dark:text-slate-400 text-xs flex justify-between font-mono">
            <span>SYSTEM: ONLINE</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">200 OK</span>
          </div>
        </aside>
      )}

    </div>
  );
}
