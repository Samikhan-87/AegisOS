interface AnimatedBotAvatarProps {
  size?: number; // width & height in px, default 110
  className?: string;
}

export function AnimatedBotAvatar({ size = 110, className = '' }: AnimatedBotAvatarProps) {
  return (
    <div
      className={`relative select-none pointer-events-none flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 160 160"
        width={size}
        height={size}
        className="w-full h-full overflow-visible drop-shadow-md"
      >
        <defs>
          {/* Subtle soft gradient for visor faceplate in dark/light mode */}
          <linearGradient id="botFacePlateGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#E5E7EB" />
            <stop offset="100%" stopColor="#D1D5DB" />
          </linearGradient>

          <filter id="botSoftGazeShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* 1. OUTER HELMET & ANTENNA (Dark in light mode, Clean White in dark mode) */}
        <g className="animate-bot-head-sway origin-bottom">
          {/* Antenna Rod */}
          <line
            x1="80"
            y1="40"
            x2="88"
            y2="15"
            stroke="#0A0B0F"
            strokeWidth="5"
            strokeLinecap="round"
            className="stroke-[#0A0B0F] dark:stroke-[#F8FAFC]"
          />
          {/* Antenna Ball Tip */}
          <circle
            cx="88"
            cy="15"
            r="6.5"
            fill="#0A0B0F"
            className="fill-[#0A0B0F] dark:fill-[#F8FAFC]"
          />

          {/* Outer Helmet Shell (White in Dark Mode, Black/Dark in Light Mode) */}
          <circle
            cx="80"
            cy="85"
            r="48"
            fill="#0A0B0F"
            className="fill-[#0A0B0F] dark:fill-[#F8FAFC]"
          />

          {/* Inner Visor / Faceplate Window */}
          <ellipse
            cx="80"
            cy="85"
            rx="34"
            ry="24"
            className="fill-[#E5E7EB] dark:fill-[#1E2230]"
          />

          {/* 2. DYNAMIC LOOKING FACE ELEMENTS (Pans smoothly Left -> Center -> Right -> Center) */}
          <g className="animate-bot-gaze">
            {/* Left Eye */}
            <circle
              cx="70"
              cy="85"
              r="6.5"
              className="fill-[#0A0B0F] dark:fill-[#F8FAFC]"
            />
            {/* Right Eye */}
            <circle
              cx="90"
              cy="85"
              r="6.5"
              className="fill-[#0A0B0F] dark:fill-[#F8FAFC]"
            />

            {/* Cheek/Cheery Visor Arc Smile Line */}
            <path
              d="M 98 78 Q 102 85 98 92"
              fill="none"
              strokeWidth="3.2"
              strokeLinecap="round"
              className="stroke-[#0A0B0F] dark:stroke-[#F8FAFC]"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
