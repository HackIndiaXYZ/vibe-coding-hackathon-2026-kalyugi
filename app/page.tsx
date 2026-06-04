'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { AlertBanner } from '@/app/components/AlertBanner';
import { FormField, inputClassName } from '@/app/components/FormField';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  // 1. Initialize WebGL Breathing Mesh Gradient Shader
  useEffect(() => {
    const canvas = document.getElementById('shader-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    function syncSize() {
      if (!canvas) return;
      const w = canvas.clientWidth || 1280;
      const h = canvas.clientHeight || 720;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    syncSize();
    window.addEventListener('resize', syncSize);

    try {
      const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (!gl) return;

      const vs = `
        attribute vec2 a_position;
        varying vec2 v_texCoord;
        void main() {
          v_texCoord = a_position * 0.5 + 0.5;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `;

      const fs = `
        precision highp float;
        varying vec2 v_texCoord;
        uniform float u_time;
        uniform vec2 u_resolution;

        float noise(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec2 uv = v_texCoord;
            vec3 color = vec3(0.02, 0.02, 0.03);
            
            vec2 p1 = vec2(0.5 + 0.3 * sin(u_time * 0.2), 0.5 + 0.2 * cos(u_time * 0.3));
            float d1 = length(uv - p1);
            color += vec3(0.05, 0.1, 0.3) * exp(-d1 * 2.5); // Electric Blue breath
            
            vec2 p2 = vec2(0.8 + 0.2 * cos(u_time * 0.4), 0.2 + 0.3 * sin(u_time * 0.2));
            float d2 = length(uv - p2);
            color += vec3(0.02, 0.15, 0.1) * exp(-d2 * 3.0); // Neon Mint glow
            
            float n = noise(uv * 100.0 + u_time * 0.01);
            color += (n - 0.5) * 0.02;
            
            gl_FragColor = vec4(color, 1.0);
        }
      `;

      const cs = (type: number, src: string) => {
        const s = gl.createShader(type);
        if (!s) return null;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };

      const prog = gl.createProgram();
      const vertexShader = cs(gl.VERTEX_SHADER, vs);
      const fragmentShader = cs(gl.FRAGMENT_SHADER, fs);
      if (!prog || !vertexShader || !fragmentShader) return;

      gl.attachShader(prog, vertexShader);
      gl.attachShader(prog, fragmentShader);
      gl.linkProgram(prog);
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

      const pos = gl.getAttribLocation(prog, 'a_position');
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

      const uTime = gl.getUniformLocation(prog, 'u_time');
      const uRes = gl.getUniformLocation(prog, 'u_resolution');

      let animationFrameId: number;
      const render = (t: number) => {
        if (!gl) return;
        gl.viewport(0, 0, canvas.width, canvas.height);
        if (uTime) gl.uniform1f(uTime, t * 0.001);
        if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        animationFrameId = requestAnimationFrame(render);
      };
      render(0);

      return () => {
        window.removeEventListener('resize', syncSize);
        cancelAnimationFrame(animationFrameId);
      };
    } catch (shaderErr) {
      console.warn("WebGL initialization failed, falling back to static background", shaderErr);
    }
  }, []);

  // 2. Handle Google Login via Supabase Auth
  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const supabase = getSupabaseClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${appUrl}/auth/callback?next=/dashboard`,
        },
      });

      if (error) {
        setErrorMsg(error.message);
      }
    } catch {
      setErrorMsg('An unexpected error occurred during Google OAuth.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Handle Email/Password Login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
    if (!password) errors.password = 'Password is required.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setLoading(true);
      setErrorMsg('');
      setFieldErrors({});
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data?.session) {
        // Store JWT inside localStorage for our custom header fetch requests
        localStorage.setItem('supabase_session_token', data.session.access_token);
        router.push('/dashboard');
      }
    } catch {
      setErrorMsg('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen min-h-[100dvh] w-full bg-background text-on-surface overflow-hidden selection:bg-primary/30 selection:text-primary">
      {/* Left Side: Visual/Branding (Hidden on mobile) */}
      <div className="hidden lg:flex w-1/2 relative flex-col justify-between p-8 xl:p-20 overflow-hidden">
        {/* Shader Background */}
        <div className="absolute inset-0 z-0 opacity-60 mix-blend-screen">
          <div className="absolute inset-0 w-full h-full" style={{ display: 'block' }}>
            <canvas id="shader-canvas" style={{ display: 'block', width: '100%', height: '100%' }}></canvas>
          </div>
        </div>
        {/* Vignette Overlay */}
        <div className="absolute inset-0 z-10 bg-gradient-to-r from-background via-transparent to-background/80"></div>
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-background via-transparent to-background/50"></div>
        
        {/* Header/Logo */}
        <div className="relative z-20 stagger-1">
          <h1 className="font-display-lg text-headline-sm font-bold text-primary flex items-center gap-1">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>assessment</span>
            ReportAI
          </h1>
        </div>

        {/* 3D Dashboard Preview */}
        <div className="relative z-20 flex-1 flex items-center justify-center my-12">
          <div className="preserve-3d preview-3d w-full max-w-lg glass-panel rounded-xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 relative">
            {/* Faux Header */}
            <div className="flex justify-between items-center mb-6 pb-3 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-container/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[16px]">bar_chart</span>
                </div>
                <div>
                  <div className="font-data-sm text-data-sm text-on-surface">Monthly ROI</div>
                  <div className="font-data-lg text-data-lg text-primary">₹1,245,000</div>
                </div>
              </div>
              <div className="font-label-caps text-label-caps text-secondary-container bg-secondary-container/10 px-3 py-1 rounded-full border border-secondary-container/20">
                +14.2%
              </div>
            </div>
            {/* Faux Chart */}
            <div className="h-32 w-full flex items-end gap-1 mb-6">
              <div className="w-1/6 bg-white/5 rounded-t-sm h-1/3"></div>
              <div className="w-1/6 bg-white/5 rounded-t-sm h-1/2"></div>
              <div className="w-1/6 bg-white/5 rounded-t-sm h-2/3 relative">
                <div className="absolute inset-0 bg-primary/20 animate-pulse"></div>
              </div>
              <div className="w-1/6 bg-primary/40 rounded-t-sm h-3/4 border-t-2 border-primary glow-active relative">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 font-data-sm text-[10px] text-primary">Q3</div>
              </div>
              <div className="w-1/6 bg-white/5 rounded-t-sm h-full"></div>
              <div className="w-1/6 bg-white/5 rounded-t-sm h-5/6"></div>
            </div>
            {/* Faux Data Rows */}
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                <span className="font-body-md text-data-sm text-on-surface-variant">Organic Traffic</span>
                <span className="font-data-sm text-data-sm text-on-surface">84,201</span>
              </div>
              <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                <span className="font-body-md text-data-sm text-on-surface-variant">Conversion Rate</span>
                <span className="font-data-sm text-data-sm text-secondary-container">4.8%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Copy */}
        <div className="relative z-20 stagger-2">
          <h2 className="font-display-lg text-headline-md lg:text-display-lg text-on-surface leading-tight">
            Reports that<br />
            <span className="text-primary">write themselves</span><br />
            <span className="word-cycle-container text-on-surface-variant h-[1.1em] overflow-hidden relative inline-block">
              <div className="word-cycle">
                <span>for agencies.</span>
                <span>for freelancers.</span>
                <span>for growth.</span>
                <span>for agencies.</span>
              </div>
            </span>
          </h2>
        </div>
      </div>

      {/* Right Side: Auth Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-margin-mobile md:p-margin-desktop relative z-20 bg-surface-container-lowest/90 lg:bg-transparent backdrop-blur-3xl lg:backdrop-blur-none overflow-y-auto">
        <div className="w-full max-w-md space-y-8 py-8 lg:py-12">
          {/* Mobile Logo (Visible only on small screens) */}
          <div className="lg:hidden flex justify-center mb-12 stagger-1">
            <h1 className="font-display-lg-mobile text-headline-md font-bold text-primary flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>assessment</span>
              ReportAI
            </h1>
          </div>
          <div className="space-y-1 text-center lg:text-left stagger-2">
            <h2 className="font-headline-md text-headline-md text-on-surface">Welcome to ReportAI</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant">Initialize your command center.</p>
          </div>
          
          {errorMsg && <AlertBanner type="error" message={errorMsg} onDismiss={() => setErrorMsg('')} />}

          <div className="space-y-6 stagger-3">
            {/* Social Login */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="btn btn-ghost w-full py-3 group"
            >
              <svg className="w-5 h-5 text-on-surface group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
              </svg>
              {loading ? 'Connecting...' : 'Sign in with Google'}
            </button>
            <div className="relative flex items-center py-3">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink-0 mx-6 font-label-caps text-label-caps text-outline">OR</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>
            {/* Email/Password Form */}
            <form onSubmit={handleEmailLogin} className="space-y-5" noValidate>
              <FormField id="email" label="Email Address" error={fieldErrors.email}>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-[20px] pointer-events-none">mail</span>
                  <input
                    className={`${inputClassName} py-3 pl-12 pr-3`}
                    id="email"
                    placeholder="agent@agency.com"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                    disabled={loading}
                  />
                </div>
              </FormField>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label htmlFor="password" className="form-label">Password</label>
                  <span className="font-label-caps text-label-caps text-primary opacity-70 cursor-not-allowed text-[10px]" title="Coming soon">Forgot?</span>
                </div>
                {fieldErrors.password && (
                  <p id="password-error" className="form-error mb-1.5" role="alert">{fieldErrors.password}</p>
                )}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-[20px] pointer-events-none">lock</span>
                  <input
                    className={`${inputClassName} py-3 pl-12 pr-3`}
                    id="password"
                    placeholder="••••••••"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                    disabled={loading}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full py-3 mt-4 font-headline-sm normal-case tracking-normal text-base"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                    Authenticating...
                  </>
                ) : (
                  <>
                    Enter Command Center
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </>
                )}
              </button>
            </form>
          </div>
          <div className="text-center font-body-md text-data-sm text-on-surface-variant stagger-4">
            Don't have an access key? <a className="text-primary hover:text-primary-fixed transition-colors border-b border-primary/30 hover:border-primary" href="#">Request Access</a>
          </div>
        </div>
      </div>
    </div>
  );
}
