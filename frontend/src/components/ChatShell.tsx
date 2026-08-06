import React, { useState, useEffect } from 'react';
import { Send, Bot, Database, ShieldAlert, Sparkles, Sun, Moon, Terminal } from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  icon: React.ElementType;
  active: boolean;
}

export function ChatShell() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

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

  const [agents] = useState<Agent[]>([
    {
      id: '1',
      name: 'Aegis Core Agent',
      role: 'Orchestrator & Router',
      icon: Bot,
      active: true,
    },
    {
      id: '2',
      name: 'RAG Retriever',
      role: 'Knowledge Base & Search',
      icon: Database,
      active: false,
    },
    {
      id: '3',
      name: 'Security Auditor',
      role: 'Validation & Guardrails',
      icon: ShieldAlert,
      active: false,
    },
  ]);

  const [selectedAgent, setSelectedAgent] = useState<Agent>(agents[0]);
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'agent',
      text: 'Hello! I am Aegis AI Shell. Choose an agent from the sidebar or type a message to get started.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputMessage.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const dummyResponse: Message = {
      id: (Date.now() + 1).toString(),
      sender: 'agent',
      text: `[Echo from ${selectedAgent.name}]: ${inputMessage.trim()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg, dummyResponse]);
    setInputMessage('');
  };

  const SelectedAgentIcon = selectedAgent.icon;

  return (
    <div className="flex h-screen w-screen bg-[#F4F4F6] dark:bg-[#0B0F17] text-[#1E293B] dark:text-[#E2E8F0] overflow-hidden font-sans select-none transition-colors duration-300 relative">
      {/* Layered Aesthetic Background Ambient Blur Orbs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-500/15 dark:bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute top-1/3 -right-32 w-[30rem] h-[30rem] bg-teal-500/15 dark:bg-teal-500/10 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-cyan-500/10 dark:bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none z-0" />

      {/* Sidebar with Glassmorphism & Gradient Border */}
      <aside className="w-80 bg-white/75 dark:bg-[#111827]/75 backdrop-blur-xl border-r border-[#E2E8F0]/80 dark:border-[#1F2937]/80 flex flex-col justify-between z-20 transition-colors duration-300">
        <div>
          {/* Brand Header */}
          <div className="p-6 border-b border-[#E2E8F0]/80 dark:border-[#1F2937]/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-xl shadow-md shadow-emerald-500/20">
                <Sparkles className="w-5 h-5 stroke-[1.75]" />
              </div>
              <div>
                <h1 className="font-heading font-bold text-lg text-[#0F172A] dark:text-white tracking-tight leading-none">
                  Aegis AI
                </h1>
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-medium mt-1 tracking-wider uppercase">
                  Multi-Agent OS
                </p>
              </div>
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              title="Toggle Light / Dark Mode"
              className="p-2 rounded-xl border border-[#E2E8F0] dark:border-[#1F2937] bg-white/80 dark:bg-[#1E293B]/80 backdrop-blur-md text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white transition-all duration-200 shadow-xs"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-[#F59E0B]" /> : <Moon className="w-4 h-4 text-[#0EA5E9]" />}
            </button>
          </div>

          {/* Agent Selector List */}
          <div className="p-4 space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#94A3B8] dark:text-[#64748B] mb-3 px-3">
              Active Agents
            </h2>
            <div className="space-y-2">
              {agents.map((agent) => {
                const IconComponent = agent.icon;
                const isSelected = selectedAgent.id === agent.id;
                return (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    className={`group relative w-full flex items-center space-x-3.5 px-3.5 py-3 rounded-xl text-left transition-all duration-200 ease-out ${
                      isSelected
                        ? 'bg-white/80 dark:bg-[#1E293B]/80 text-[#0F172A] dark:text-white shadow-md dark:shadow-black/40 backdrop-blur-md'
                        : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white hover:bg-white/50 dark:hover:bg-[#1E293B]/40'
                    }`}
                  >
                    {/* Active Gradient Border Highlight */}
                    {isSelected && (
                      <span className="absolute inset-0 rounded-xl p-[1px] bg-gradient-to-r from-emerald-500/50 via-teal-500/30 to-transparent pointer-events-none" />
                    )}

                    {/* Agent Icon Badge */}
                    <div
                      className={`p-2.5 rounded-lg flex items-center justify-center transition-all duration-200 ${
                        isSelected
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/30'
                          : 'bg-[#F1F5F9] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8]'
                      }`}
                    >
                      <IconComponent className="w-4 h-4 stroke-[1.75]" />
                    </div>

                    {/* Agent Meta Info */}
                    <div className="overflow-hidden flex-1">
                      <div className="text-sm font-heading font-semibold">
                        {agent.name}
                      </div>
                      <div className="text-[12px] font-normal mt-0.5 truncate text-[#64748B] dark:text-[#94A3B8]">
                        {agent.role}
                      </div>
                    </div>

                    {/* Active indicator dot */}
                    {isSelected && (
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-sm shadow-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* System Status Footer */}
        <div className="p-4 mx-4 mb-4 rounded-xl border border-[#E2E8F0]/80 dark:border-[#1F2937]/80 bg-white/60 dark:bg-[#0F172A]/60 backdrop-blur-md flex items-center justify-between text-xs transition-colors duration-300">
          <span className="text-[#64748B] dark:text-[#94A3B8] font-medium">System Status</span>
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-[#059669] dark:text-[#34D399] border border-emerald-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Ready
          </span>
        </div>
      </aside>

      {/* Main Chat Window */}
      <main className="flex-1 flex flex-col relative overflow-hidden transition-colors duration-300 z-10">
        {/* Agent Header with Glassmorphism */}
        <header className="h-20 px-8 flex items-center justify-between border-b border-[#E2E8F0]/80 dark:border-[#1F2937]/80 bg-white/70 dark:bg-[#111827]/70 backdrop-blur-xl z-10 relative transition-colors duration-300">
          <div className="flex items-center space-x-4">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
              <SelectedAgentIcon className="w-5 h-5 stroke-[1.75]" />
            </div>
            <div>
              <h2 className="text-lg font-heading font-semibold text-[#0F172A] dark:text-white tracking-tight">
                {selectedAgent.name}
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] font-normal mt-0.5">{selectedAgent.role}</p>
            </div>
          </div>

          {/* Subtitle status tag */}
          <div className="hidden sm:flex items-center space-x-2 text-xs text-[#475569] dark:text-[#94A3B8] bg-white/60 dark:bg-[#1E293B]/60 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#374151]">
            <Terminal className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            <span>LangGraph Engine Active</span>
          </div>
        </header>

        {/* Gradient Line Accent Separator */}
        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent z-10" />

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 z-10">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start space-x-3.5 max-w-3xl ${
                msg.sender === 'user' ? 'ml-auto flex-row-reverse space-x-reverse' : ''
              }`}
            >
              {/* Avatar Icon */}
              {msg.sender === 'agent' ? (
                <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex-shrink-0 mt-0.5 shadow-sm">
                  <SelectedAgentIcon className="w-4 h-4 stroke-[1.75]" />
                </div>
              ) : null}

              {/* Message Content Bubble with Glassmorphism */}
              <div
                className={`group relative px-5 py-3.5 rounded-2xl text-sm leading-relaxed transition-all duration-150 ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-tr-xs shadow-md shadow-emerald-950/20 font-normal'
                    : 'bg-white/80 dark:bg-[#111827]/80 backdrop-blur-xl border border-[#E2E8F0]/80 dark:border-[#1F2937]/80 text-[#1E293B] dark:text-[#E2E8F0] rounded-tl-xs shadow-sm font-normal'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                <div
                  className={`text-[10px] font-normal mt-2 tracking-wide ${
                    msg.sender === 'user' ? 'text-emerald-100 text-right' : 'text-[#94A3B8]'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Input Section with Glassmorphism */}
        <footer className="p-6 border-t border-[#E2E8F0]/80 dark:border-[#1F2937]/80 bg-white/70 dark:bg-[#111827]/70 backdrop-blur-xl z-10 transition-colors duration-300">
          <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={`Message ${selectedAgent.name}...`}
                className="w-full bg-white/80 dark:bg-[#0B0F17]/80 backdrop-blur-md border border-[#E2E8F0] dark:border-[#1F2937] rounded-xl px-4 py-3.5 text-sm text-[#0F172A] dark:text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all duration-200 font-normal"
              />
            </div>
            <button
              type="submit"
              disabled={!inputMessage.trim()}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-3.5 rounded-xl flex items-center justify-center transition-all duration-200 font-medium text-sm shadow-md shadow-emerald-600/20"
            >
              <Send className="w-4 h-4 stroke-[2]" />
            </button>
          </form>
        </footer>
      </main>
    </div>
  );
}
