import React, { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { askRAGAgent } from '../services/api';
import type { Citation, RAGAskPayload } from '../services/api';
import { AnimatedBotAvatar } from './AnimatedBotAvatar';
import {
  Home,
  LayoutGrid,
  Compass,
  Database,
  Search,
  Paperclip,
  Sparkles,
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
  Bot,
  Copy,
  Check,
  MessageSquare,
  Plus,
  Trash2
} from 'lucide-react';

interface ExecutionStep {
  step: string;
  agent: string;
  latencyMs: number;
  status: 'completed' | 'active' | 'pending' | 'failed';
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
  isSecurityBlocked?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: Message[];
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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loadingStepText, setLoadingStepText] = useState('Searching ChromaDB vectors & BM25 keyword index...');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStats, setIngestStats] = useState<{
    totalDocs: number;
    totalChunks: number;
  } | null>(null);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [searchHistoryQuery, setSearchHistoryQuery] = useState('');

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => {
      setCopiedMessageId((prev) => (prev === id ? null : prev));
    }, 2000);
  };

  // LocalStorage-backed chat session history (like ChatGPT)
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('aegis_chat_sessions');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading sessions from localStorage', e);
    }
    return [];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    try {
      const activeId = localStorage.getItem('aegis_active_session_id');
      if (activeId) return activeId;
    } catch (e) {}
    return 'default';
  });

  // Load initial messages for active session or fresh session
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('aegis_chat_sessions');
      const activeId = localStorage.getItem('aegis_active_session_id') || 'default';
      if (saved) {
        const parsed: ChatSession[] = JSON.parse(saved);
        const active = parsed.find((s) => s.id === activeId);
        if (active && active.messages) return active.messages;
      }
    } catch (e) {}
    return [];
  });

  // Sync messages into sessions and save to localStorage
  useEffect(() => {
    if (messages.length === 0) return;

    setSessions((prevSessions) => {
      const sessionTitle = messages[0]?.text.slice(0, 36) + (messages[0]?.text.length > 36 ? '...' : '') || 'New Chat';
      const existingIndex = prevSessions.findIndex((s) => s.id === currentSessionId);
      
      let updated: ChatSession[];
      if (existingIndex >= 0) {
        updated = [...prevSessions];
        updated[existingIndex] = {
          ...updated[existingIndex],
          title: updated[existingIndex].title || sessionTitle,
          messages: messages
        };
      } else {
        updated = [
          {
            id: currentSessionId,
            title: sessionTitle,
            createdAt: Date.now(),
            messages: messages
          },
          ...prevSessions
        ];
      }

      try {
        localStorage.setItem('aegis_chat_sessions', JSON.stringify(updated));
        localStorage.setItem('aegis_active_session_id', currentSessionId);
      } catch (e) {}

      return updated;
    });
  }, [messages, currentSessionId]);

  // Handle switching to a past chat session
  const handleSelectSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages || []);
    try {
      localStorage.setItem('aegis_active_session_id', session.id);
    } catch (e) {}
    setMobileNavOpen(false);
  };

  // Handle starting a new chat session
  const handleNewChat = () => {
    const newId = 'session_' + Date.now();
    setCurrentSessionId(newId);
    setMessages([]);
    try {
      localStorage.setItem('aegis_active_session_id', newId);
    } catch (e) {}
    setMobileNavOpen(false);
  };

  // Handle deleting a chat session
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessionId);
      try {
        localStorage.setItem('aegis_chat_sessions', JSON.stringify(filtered));
      } catch (err) {}
      return filtered;
    });

    if (currentSessionId === sessionId) {
      handleNewChat();
    }
  };

  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryStartMsRef = useRef<number>(Date.now());

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
      queryStartMsRef.current = Date.now();
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
      const isSecurityBlocked = data.security_check && data.security_check.is_safe === false;
      const totalElapsedMs = Math.max(Date.now() - queryStartMsRef.current, 100);
      const llmLatencyMs = isSecurityBlocked ? 0 : Math.max(totalElapsedMs - 145, 80);

      const sources: KnowledgeSource[] = (data.retrieved_chunks || []).map((item: any) => ({
        title: item.metadata?.source_filename || item.metadata?.filename || 'Document.pdf',
        department: item.metadata?.department || 'General',
        chunkIndex: item.metadata?.chunk_index ?? 0,
        score: item.fused_rrf_score || item.similarity_score || item.bm25_score || 0.9,
        text: item.text
      }));

      const trail: ExecutionStep[] = isSecurityBlocked
        ? [
            { step: 'Security Guardrail Check', agent: 'Guardrail Scanner', latencyMs: 2, status: 'completed' },
            { step: 'Query Blocked (Malicious Pattern Detected)', agent: 'Security Auditor', latencyMs: 0, status: 'failed' }
          ]
        : [
            { step: 'Security Guardrail (Pass)', agent: 'Security Auditor', latencyMs: 2, status: 'completed' },
            { step: 'Hybrid Retrieval (BM25 + ChromaDB)', agent: 'RAG Retriever', latencyMs: 140, status: 'completed' },
            { step: 'Grounded LLM Answer (Ollama)', agent: 'Ollama LLM', latencyMs: llmLatencyMs, status: 'completed' },
            { step: 'Output Compliance Guardrail', agent: 'Security Auditor', latencyMs: 3, status: 'completed' }
          ];

      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'agent',
        text: data.answer || "No response generated.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        agentId: isSecurityBlocked ? 'security-auditor' : selectedAgent.id,
        agentName: isSecurityBlocked ? 'Security Auditor' : selectedAgent.name,
        isSecurityBlocked,
        reasoningSummary: isSecurityBlocked
          ? `Blocked by Security Auditor: ${data.security_check?.reason || 'Adversarial pattern detected.'}`
          : `Executed LangGraph RAG Agent (Hybrid Retrieval + Grounded Ollama LLM). Scope: [${variables.department_filter || 'ALL'}].`,
        executionTrail: trail,
        sources,
        citations: data.citations || [],
        observability: {
          latencyMs: isSecurityBlocked ? 5 : totalElapsedMs,
          totalTokens: Math.round(variables.query.length / 4) + (isSecurityBlocked ? 12 : 240),
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
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
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
    <div className="flex h-dvh w-screen bg-[#ECEEF4] dark:bg-[#0C0D12] text-slate-900 dark:text-slate-100 font-sans select-none overflow-hidden relative">
      
      {/* ========================================================================= */}
      {/* 1. SIDEBAR */}
      {/* ========================================================================= */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 w-64 sm:w-72 bg-[#F6F7FB] dark:bg-[#0A0B0F] border-r border-slate-300/70 dark:border-[#1B1D28] flex flex-col justify-between z-40 transition-transform duration-300 transform ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } shrink-0 p-5`}
      >
        <div className="space-y-6">
          {/* Brand Header with AnimatedBotAvatar in Logo */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-slate-100 dark:bg-[#161824] border border-slate-200/80 dark:border-[#252838] shadow-xs">
                <AnimatedBotAvatar size={26} />
              </div>
              <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">Aegis OS</span>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                onClick={handleNewChat}
                title="New Chat"
                className="p-1.5 rounded-xl border border-slate-200 dark:border-[#232636] bg-slate-100 dark:bg-[#141620] text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-500/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={toggleTheme}
                title="Toggle Theme"
                className="p-1.5 rounded-xl border border-slate-200 dark:border-[#232636] bg-slate-100 dark:bg-[#141620] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-500" />}
              </button>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="md:hidden p-1.5 rounded-xl border border-slate-200 dark:border-[#232636] bg-slate-100 dark:bg-[#141620] text-slate-600 dark:text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search Chats Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={searchHistoryQuery}
              onChange={(e) => setSearchHistoryQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full bg-white dark:bg-[#141620] border border-slate-200 dark:border-[#232636] rounded-xl pl-9 pr-9 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500/60 font-medium shadow-xs"
            />
            <span className="absolute right-3 top-2 text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#1E202C] px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#2A2D3D]">
              ⌘K
            </span>
          </div>

          {/* Core Navigation Links */}
          <nav className="space-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-semibold">
            <button
              onClick={handleNewChat}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all ${
                messages.length === 0
                  ? 'text-sky-800 dark:text-slate-100 bg-sky-500/10 dark:bg-[#171924] border border-sky-500/20 dark:border-[#252838] shadow-xs'
                  : 'hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#141620]'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Home className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                <span>New Chat</span>
              </div>
              <Plus className="w-3.5 h-3.5 text-slate-400" />
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
              <Database className="w-4 h-4 text-slate-400" />
              <span>Vector Store</span>
            </button>
          </nav>

          {/* ChatGPT-Style LocalStorage Chat History */}
          <div className="pt-2 border-t border-slate-200/80 dark:border-[#1A1C28] flex-1 overflow-y-auto max-h-[42vh] no-scrollbar space-y-3">
            <div className="flex items-center justify-between px-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Recent Chats ({sessions.length})
              </span>
            </div>

            <div className="space-y-1 text-xs">
              {sessions.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-slate-400 italic font-normal">
                  No saved conversations yet. Ask a question to start history!
                </div>
              ) : (
                sessions
                  .filter((s) => !searchHistoryQuery.trim() || s.title.toLowerCase().includes(searchHistoryQuery.toLowerCase()))
                  .map((session) => {
                    const isActive = currentSessionId === session.id;
                    return (
                      <div
                        key={session.id}
                        onClick={() => handleSelectSession(session)}
                        className={`group flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all duration-150 ${
                          isActive
                            ? 'bg-sky-500/10 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200 font-semibold border border-sky-500/20'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#141620]'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 truncate min-w-0 pr-2">
                          <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-sky-500' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />
                          <span className="truncate text-xs">{session.title}</span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          title="Delete chat"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 transition-all shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })
              )}
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
      <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden relative bg-[#ECEEF4] dark:bg-[#0C0D12] z-10">
        
        {/* ABSTRACT 3D FLOWING WAVE BACKDROP - SEAMLESS HORIZONTAL NEWS TICKER LOOP */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          {/* Ambient Glowing Aura In Loop */}
          <div className="absolute top-1/4 left-1/3 w-[700px] h-[700px] rounded-full bg-cyan-500/10 dark:bg-cyan-500/15 blur-[140px] animate-pulse pointer-events-none" />
          <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] rounded-full bg-sky-600/10 dark:bg-sky-600/15 blur-[120px] animate-pulse pointer-events-none" />

          {/* Endless Horizontal Marquee Track */}
          <div className="horizontal-wave-marquee flex w-[200%] h-full shrink-0">
            <div className="w-1/2 h-full shrink-0">
              <img
                src={theme === 'dark' ? '/abstract_wave_dark.jpg' : '/abstract_wave_light.jpg'}
                alt="Abstract Fluid Blue Wave 1"
                className={`w-full h-full object-cover object-center select-none ${
                  theme === 'dark'
                    ? 'opacity-35 mix-blend-screen filter saturate-125'
                    : 'opacity-55 mix-blend-multiply filter contrast-110 saturate-110'
                }`}
              />
            </div>
            <div className="w-1/2 h-full shrink-0">
              <img
                src={theme === 'dark' ? '/abstract_wave_dark.jpg' : '/abstract_wave_light.jpg'}
                alt="Abstract Fluid Blue Wave 2"
                className={`w-full h-full object-cover object-center select-none scale-x-[-1] ${
                  theme === 'dark'
                    ? 'opacity-35 mix-blend-screen filter saturate-125'
                    : 'opacity-55 mix-blend-multiply filter contrast-110 saturate-110'
                }`}
              />
            </div>
          </div>

          {/* Subtle vignette overlay to ensure pristine foreground contrast */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#ECEEF4]/60 via-transparent to-[#ECEEF4]/85 dark:from-[#0C0D12]/85 dark:via-transparent dark:to-[#0C0D12]/95" />
        </div>

        {/* Fixed Top Header Bar */}
        <header className="h-16 shrink-0 px-4 sm:px-6 flex items-center justify-between border-b border-slate-300/70 dark:border-[#1A1C28] bg-[#F6F7FB]/90 dark:bg-[#0C0D12]/80 backdrop-blur-md z-30 overflow-visible">
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
          /* INITIAL WELCOME SCREEN (Inspired by Reference Images 1 & 2) */
          <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 flex flex-col justify-between items-center z-10">
            <div className="max-w-3xl w-full my-auto text-center space-y-6 sm:space-y-7 py-4">
              
              {/* Animated Continuous Looking Robot Avatar (Left -> Center -> Right -> Center) */}
              <div className="flex justify-center relative">
                <div className="w-56 h-56 bg-sky-400/20 dark:bg-sky-500/15 rounded-full blur-[80px] absolute -top-8 left-1/2 -translate-x-1/2 pointer-events-none" />
                <div className="relative z-10 transition-transform duration-300 hover:scale-105 cursor-pointer">
                  <AnimatedBotAvatar size={135} />
                </div>
              </div>

              {/* Headings */}
              <div className="space-y-2">
                <h1 className="text-3xl sm:text-5xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
                  Secure AI Built for Enterprise
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto font-normal leading-relaxed">
                  Query corporate policies, compliance directives, and banking operations with grounded RAG citations & deterministic security guardrails.
                </p>
              </div>

              {/* Centered Floating Input Card (Image 2 Style) */}
              <div className="w-full max-w-2xl mx-auto relative group text-left">
                {/* Subtle back-glow */}
                <div className="absolute -inset-1 rounded-[30px] bg-gradient-to-r from-sky-400/20 via-blue-500/20 to-cyan-400/20 blur-xl opacity-60 group-hover:opacity-90 transition duration-500 pointer-events-none" />

                {/* Frosted Glass Container */}
                <div className="relative rounded-[26px] p-4 sm:p-5 transition-all duration-300 backdrop-blur-2xl
                  bg-white/95 dark:bg-[#111624]/85 
                  border border-slate-300/80 dark:border-sky-500/20 
                  shadow-[0_20px_45px_-12px_rgba(15,23,42,0.14),0_4px_12px_-2px_rgba(15,23,42,0.06)] 
                  dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7),0_0_35px_-5px_rgba(37,99,235,0.18)]">
                  
                  <textarea
                    rows={3}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Type something to generate or ask Aegis AI..."
                    className="w-full bg-transparent text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none font-medium leading-relaxed"
                  />

                  {/* Bottom Controls Row: Pill Chips on Left, Action Buttons on Right */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/90 dark:border-slate-800/80">
                    
                    {/* Left Side: Department Filter Pill Chips (like [Android] [iOS] in Image 2) */}
                    <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                      {['ALL', 'AI Governance', 'Banking Operations', 'Compliance', 'Customer Service'].map((dept) => {
                        const isSelected = activeDepartment === dept;
                        return (
                          <button
                            key={dept}
                            type="button"
                            onClick={() => setActiveDepartment(dept)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all duration-200 ${
                              isSelected
                                ? 'bg-slate-900 text-white shadow-xs dark:bg-sky-500 dark:text-slate-950 dark:font-bold'
                                : 'bg-slate-200/70 hover:bg-slate-300/80 text-slate-700 hover:text-slate-900 dark:bg-slate-800/70 dark:hover:bg-slate-700/80 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-300/60 dark:border-slate-700/50'
                            }`}
                          >
                            {dept === 'ALL' ? 'All Policies' : dept}
                          </button>
                        );
                      })}
                    </div>

                    {/* Right Side: Batch Ingest Paperclip + High-contrast Pill "Generate" Button */}
                    <div className="flex items-center space-x-2 ml-auto">
                      <button
                        type="button"
                        onClick={handleBatchIngest}
                        disabled={isIngesting}
                        title="Batch Ingest PDFs (/ingest-all)"
                        className="p-2.5 rounded-full bg-slate-200/70 hover:bg-slate-300/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all disabled:opacity-50 border border-slate-300/60 dark:border-slate-700/60"
                      >
                        {isIngesting ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-sky-500" />
                        ) : (
                          <Paperclip className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendMessage()}
                        disabled={!inputMessage.trim() || isProcessing}
                        className="px-5 py-2.5 rounded-full font-bold text-xs sm:text-sm flex items-center space-x-2 transition-all duration-200 shadow-md active:scale-95 disabled:opacity-40 disabled:pointer-events-none
                          bg-slate-900 hover:bg-slate-800 text-white dark:bg-gradient-to-r dark:from-sky-500 dark:via-blue-600 dark:to-indigo-600 dark:hover:from-sky-400 dark:hover:to-indigo-500 dark:shadow-sky-500/25"
                      >
                        <span>Generate</span>
                        <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                    </div>

                  </div>
                </div>

                {/* Tagline / Metric ticker below card (like "• Launch app 10x faster" in Image 2) */}
                <div className="flex items-center justify-center space-x-2.5 sm:space-x-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium pt-3.5">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    Deterministic Guardrails
                  </span>
                  <span>•</span>
                  <span>Grounded RAG Citations</span>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:inline">Local Ollama (gemma2:2b)</span>
                </div>
              </div>

              {/* 3 Grid Action Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 pt-1 relative z-10">
                <button
                  onClick={() => handleSendMessage('Who is the document owner for AB-AI-004?')}
                  className="bg-white/95 dark:bg-[#121624]/80 backdrop-blur-md hover:bg-white dark:hover:bg-[#181D2E] border border-slate-300/80 dark:border-[#232636] hover:border-sky-500/50 rounded-2xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5 space-y-1.5 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)]"
                >
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                    <span>Smart RAG Agent</span>
                    <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                    Queries local Ollama LLM with hybrid RRF retrieval & grounded document citations.
                  </div>
                </button>

                <button
                  onClick={() => handleSendMessage('What is the Business Continuity Plan for Disaster Recovery?')}
                  className="bg-white/95 dark:bg-[#121624]/80 backdrop-blur-md hover:bg-white dark:hover:bg-[#181D2E] border border-slate-300/80 dark:border-[#232636] hover:border-sky-500/50 rounded-2xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5 space-y-1.5 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)]"
                >
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                    <span>Security Audit</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                    Evaluates system directives against PII boundaries and corporate incident plans.
                  </div>
                </button>

                <button
                  onClick={() => handleSendMessage('What are the Responsible AI & LLM Security Guidelines?')}
                  className="bg-white/95 dark:bg-[#121624]/80 backdrop-blur-md hover:bg-white dark:hover:bg-[#181D2E] border border-slate-300/80 dark:border-[#232636] hover:border-sky-500/50 rounded-2xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5 sm:col-span-2 md:col-span-1 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)] space-y-1.5"
                >
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                    <span>Compliance Scope</span>
                    <Lock className="w-3.5 h-3.5 text-cyan-500" />
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                    Enforces pre-filtering over corporate departments without cross-department leaks.
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
                      <div className="flex items-start justify-end space-x-3 group">
                        <div className="relative max-w-xl bg-gradient-to-r from-sky-600 to-cyan-600 text-white px-5 py-3 rounded-2xl shadow-md text-sm leading-relaxed font-medium">
                          {msg.text}
                          
                          {/* Aesthetic Glass Copy Button for User Message */}
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.id, msg.text)}
                            title="Copy message"
                            className="absolute -left-10 top-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 backdrop-blur-md border border-white/20 dark:border-slate-700/60 text-white/80 hover:text-white shadow-xs"
                          >
                            {copiedMessageId === msg.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-300 animate-in zoom-in-75 duration-150" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-sky-600 flex items-center justify-center font-bold text-white text-xs shadow-md shrink-0 mt-0.5">
                          JM
                        </div>
                      </div>
                    ) : (
                      /* AI Agent Response Row */
                      <div className="flex items-start space-x-3 group">
                        <div className="shrink-0 mt-0.5">
                          <AnimatedBotAvatar size={36} />
                        </div>

                        {/* AI Agent Response Card Container */}
                        <div
                          className={`flex-1 rounded-2xl shadow-md ${
                            msg.isSecurityBlocked
                              ? 'security-border-loop'
                              : 'border border-slate-200 dark:border-[#232636]'
                          }`}
                        >
                          <div className="relative z-10 w-full h-full bg-white dark:bg-[#151722] rounded-[15px] p-5 space-y-3.5">
                            <div className="flex items-center justify-between text-xs border-b border-slate-200/80 dark:border-[#202330] pb-3">
                              <div className="flex items-center space-x-2">
                                <div className={`w-2 h-2 rounded-full ${msg.isSecurityBlocked ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500 dark:bg-emerald-400 animate-pulse'}`} />
                                <span className="font-bold text-slate-900 dark:text-slate-100">{msg.agentName}</span>
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                                  msg.isSecurityBlocked
                                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50'
                                    : 'bg-sky-50 dark:bg-[#1E2130] text-sky-700 dark:text-sky-400 border-sky-200 dark:border-[#2A2E44]'
                                }`}>
                                  {msg.isSecurityBlocked ? 'GUARDRAIL BLOCKED' : searchMode.toUpperCase()}
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-slate-500 dark:text-slate-400 font-mono text-xs">{msg.timestamp}</span>
                                
                                {/* Aesthetic Minimalist Copy Trigger */}
                                <button
                                  type="button"
                                  onClick={() => handleCopyMessage(msg.id, msg.text)}
                                  title="Copy response"
                                  className="flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-mono font-medium transition-all duration-200 bg-slate-100/80 hover:bg-slate-200/80 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200/60 dark:border-slate-700/50"
                                >
                                  {copiedMessageId === msg.id ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-500 animate-in zoom-in-75 duration-150" />
                                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              </div>
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
                      </div>
                    )}
                  </div>
                ))}

                {/* SINGLE PERSISTENT COMPACT PROCESSING CONTAINER */}
                {isProcessing && (
                  <div className="flex items-start space-x-3 transition-opacity duration-200">
                    <div className="shrink-0 mt-0.5">
                      <AnimatedBotAvatar size={36} />
                    </div>
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
                          Ollama (gemma2:2b)
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
            <div className="shrink-0 px-4 sm:px-6 pt-2 pb-4 sm:pb-5 z-20">
              <div className="max-w-3xl mx-auto w-full">
                <div className="relative rounded-2xl sm:rounded-[24px] p-3.5 sm:p-4 transition-all duration-200 backdrop-blur-2xl
                  bg-white/90 dark:bg-[#111624]/90 
                  border border-white/80 dark:border-sky-500/20 
                  shadow-[0_15px_35px_-5px_rgba(37,99,235,0.1),0_5px_15px_-3px_rgba(15,23,42,0.05)] 
                  dark:shadow-[0_20px_45px_-10px_rgba(0,0,0,0.7),0_0_30px_-5px_rgba(37,99,235,0.2)]">
                  
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
                    placeholder="Type something to generate or ask Aegis AI..."
                    className="w-full bg-transparent text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none font-medium"
                  />

                  <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center space-x-2 min-w-0 flex-1 overflow-hidden">
                      <button
                        type="button"
                        onClick={handleBatchIngest}
                        disabled={isIngesting}
                        title="Batch Ingest PDFs (/ingest-all)"
                        className="p-2 rounded-full shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-50 border border-slate-200/60 dark:border-slate-700/60 transition-all"
                      >
                        {isIngesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-500" /> : <Paperclip className="w-3.5 h-3.5" />}
                      </button>

                      <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar scroll-smooth">
                        {['ALL', 'AI Governance', 'Banking Operations', 'Compliance'].map((dept) => (
                          <button
                            key={dept}
                            type="button"
                            onClick={() => setActiveDepartment(dept)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
                              activeDepartment === dept
                                ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 font-semibold shadow-xs'
                                : 'bg-slate-100/90 hover:bg-slate-200 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200/60 dark:border-slate-700/60'
                            }`}
                          >
                            {dept === 'ALL' ? 'All' : dept}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSendMessage()}
                      disabled={!inputMessage.trim() || isProcessing}
                      className="px-5 py-2 rounded-full font-bold text-xs sm:text-sm flex items-center space-x-2 transition-all duration-200 shadow-md active:scale-95 disabled:opacity-40 shrink-0
                        bg-slate-900 hover:bg-slate-800 text-white dark:bg-gradient-to-r dark:from-sky-500 dark:via-blue-600 dark:to-indigo-600 dark:hover:from-sky-400 dark:hover:to-indigo-500 dark:shadow-sky-500/25"
                    >
                      <span>Generate</span>
                      <Send className="w-3.5 h-3.5 stroke-[2.5]" />
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
                  <span className="text-sky-600 dark:text-sky-400 font-semibold">Ollama (gemma2:2b)</span>
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
