/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/**/*.{ts,tsx}',
    // Include consuming apps
    '../../apps/web/src/**/*.{ts,tsx}',
    '../../apps/web-admin/src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        synapse: {
          50: 'hsl(var(--synapse-50))',
          100: 'hsl(var(--synapse-100))',
          200: 'hsl(var(--synapse-200))',
          400: 'hsl(var(--synapse-400))',
          600: 'hsl(var(--synapse-600))',
          900: 'hsl(var(--synapse-900))',
        },
        dendrite: {
          50: 'hsl(var(--dendrite-50))',
          100: 'hsl(var(--dendrite-100))',
          200: 'hsl(var(--dendrite-200))',
          400: 'hsl(var(--dendrite-400))',
          600: 'hsl(var(--dendrite-600))',
          900: 'hsl(var(--dendrite-900))',
        },
        myelin: {
          50: 'hsl(var(--myelin-50))',
          100: 'hsl(var(--myelin-100))',
          200: 'hsl(var(--myelin-200))',
          400: 'hsl(var(--myelin-400))',
          600: 'hsl(var(--myelin-600))',
          900: 'hsl(var(--myelin-900))',
        },
        neuron: {
          50: 'hsl(var(--neuron-50))',
          100: 'hsl(var(--neuron-100))',
          200: 'hsl(var(--neuron-200))',
          400: 'hsl(var(--neuron-400))',
          600: 'hsl(var(--neuron-600))',
          900: 'hsl(var(--neuron-900))',
        },
        cortex: {
          50: 'hsl(var(--cortex-50))',
          100: 'hsl(var(--cortex-100))',
          200: 'hsl(var(--cortex-200))',
          400: 'hsl(var(--cortex-400))',
          600: 'hsl(var(--cortex-600))',
          900: 'hsl(var(--cortex-900))',
        },
        axon: {
          50: 'hsl(var(--axon-50))',
          100: 'hsl(var(--axon-100))',
          200: 'hsl(var(--axon-200))',
          400: 'hsl(var(--axon-400))',
          600: 'hsl(var(--axon-600))',
          900: 'hsl(var(--axon-900))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'slide-in-from-top': {
          from: { transform: 'translateY(-100%)' },
          to: { transform: 'translateY(0)' },
        },
        'slide-in-from-bottom': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-out': 'fade-out 0.2s ease-out',
        'slide-in-from-top': 'slide-in-from-top 0.3s ease-out',
        'slide-in-from-bottom': 'slide-in-from-bottom 0.3s ease-out',
        'spin-slow': 'spin-slow 3s linear infinite',
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
