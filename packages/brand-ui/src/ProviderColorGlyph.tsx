'use client';

import { useId } from 'react';

/*
 * SVG paths from @lobehub/icons-static-svg@1.95.1
 * https://github.com/lobehub/lobe-icons
 *
 * MIT License
 * Copyright (c) 2023 LobeHub
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
const geminiPath = "M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z";
const minimaxPath = "M16.278 2c1.156 0 2.093.927 2.093 2.07v12.501a.74.74 0 00.744.709.74.74 0 00.743-.709V9.099a2.06 2.06 0 012.071-2.049A2.06 2.06 0 0124 9.1v6.561a.649.649 0 01-.652.645.649.649 0 01-.653-.645V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v7.472a2.037 2.037 0 01-2.048 2.026 2.037 2.037 0 01-2.048-2.026v-12.5a.785.785 0 00-.788-.753.785.785 0 00-.789.752l-.001 15.904A2.037 2.037 0 0113.441 22a2.037 2.037 0 01-2.048-2.026V18.04c0-.356.292-.645.652-.645.36 0 .652.289.652.645v1.934c0 .263.142.506.372.638.23.131.514.131.744 0a.734.734 0 00.372-.638V4.07c0-1.143.937-2.07 2.093-2.07zm-5.674 0c1.156 0 2.093.927 2.093 2.07v11.523a.648.648 0 01-.652.645.648.648 0 01-.652-.645V4.07a.785.785 0 00-.789-.78.785.785 0 00-.789.78v14.013a2.06 2.06 0 01-2.07 2.048 2.06 2.06 0 01-2.071-2.048V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v3.8a2.06 2.06 0 01-2.071 2.049A2.06 2.06 0 010 12.9v-1.378c0-.357.292-.646.652-.646.36 0 .653.29.653.646V12.9c0 .418.343.757.766.757s.766-.339.766-.757V9.099a2.06 2.06 0 012.07-2.048 2.06 2.06 0 012.071 2.048v8.984c0 .419.343.758.767.758.423 0 .766-.339.766-.758V4.07c0-1.143.937-2.07 2.093-2.07z";

export function ProviderColorGlyph({ kind }: { kind: 'gemini' | 'minimax' }) {
  const id = `provider-${kind}-${useId().replace(/:/g, '')}`;

  if (kind === 'gemini') return <>
    <path d={geminiPath} fill="#3186FF" />
    <path d={geminiPath} fill={`url(#${id}-green)`} />
    <path d={geminiPath} fill={`url(#${id}-red)`} />
    <path d={geminiPath} fill={`url(#${id}-yellow)`} />
    <defs>
      <linearGradient id={`${id}-green`} gradientUnits="userSpaceOnUse" x1="7" x2="11" y1="15.5" y2="12">
        <stop stopColor="#08B962" />
        <stop offset="1" stopColor="#08B962" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${id}-red`} gradientUnits="userSpaceOnUse" x1="8" x2="11.5" y1="5.5" y2="11">
        <stop stopColor="#F94543" />
        <stop offset="1" stopColor="#F94543" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${id}-yellow`} gradientUnits="userSpaceOnUse" x1="3.5" x2="17.5" y1="13.5" y2="12">
        <stop stopColor="#FABC12" />
        <stop offset=".46" stopColor="#FABC12" stopOpacity="0" />
      </linearGradient>
    </defs>
  </>;

  return <>
    <defs>
      <linearGradient id={id} x1="0%" x2="100.182%" y1="50.057%" y2="50.057%">
        <stop offset="0%" stopColor="#E2167E" />
        <stop offset="100%" stopColor="#FE603C" />
      </linearGradient>
    </defs>
    <path d={minimaxPath} fill={`url(#${id})`} fillRule="nonzero" />
  </>;
}
