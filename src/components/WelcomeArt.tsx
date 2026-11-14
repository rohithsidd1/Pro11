// Flat, minimal illustration: the ball has just clipped the stumps and one bail pops off.
const SVG = `<svg class="welcome-art" viewBox="56 18 278 262" role="img" aria-label="A cricket ball has just hit the stumps and a bail is popping off">
<defs><clipPath id="wfm-ball"><circle cx="158" cy="228" r="22"/></clipPath></defs>
<circle cx="318" cy="84" r="7" fill="#8381F4"/><circle cx="78" cy="112" r="4.5" fill="#F45BC8"/>
<path d="M300 196l2.6 6.4 6.4 2.6-6.4 2.6-2.6 6.4-2.6-6.4-6.4-2.6 6.4-2.6z" fill="#7CC66A"/>
<ellipse cx="200" cy="252" rx="92" ry="7" fill="#1A1714" opacity=".1"/>
<rect x="181" y="116" width="14" height="136" rx="7" fill="#FFFFFF"/><rect x="190" y="124" width="5" height="128" rx="2.5" fill="#EDE5D4"/>
<rect x="200" y="116" width="14" height="136" rx="7" fill="#FFFFFF"/><rect x="209" y="124" width="5" height="128" rx="2.5" fill="#EDE5D4"/>
<rect x="219" y="116" width="14" height="136" rx="7" fill="#FFFFFF"/><rect x="228" y="124" width="5" height="128" rx="2.5" fill="#EDE5D4"/>
<rect x="182" y="108" width="25" height="7" rx="3.5" fill="#E2A957"/>
<g transform="translate(250 84) rotate(26)"><g class="wl-bail"><rect x="-12.5" y="-3.5" width="25" height="7" rx="3.5" fill="#E2A957"/></g></g>
<path d="M226 100l-4-6M236 96l1-7M243 104l6-3" stroke="#1A1714" stroke-width="2.4" stroke-linecap="round" opacity=".28"/>
<path d="M104 220h18M94 231h26M106 242h16" stroke="#1A1714" stroke-width="3" stroke-linecap="round" opacity=".14"/>
<circle cx="158" cy="228" r="22" fill="#C63A2B"/><circle cx="153" cy="223" r="22" fill="#E5452F" clip-path="url(#wfm-ball)"/>
<path d="M148 208c-6 13-6 27 0 40" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/>
<path d="M154 207c-6 14-6 28 0 42" fill="none" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="1.6 3.2"/>
<ellipse cx="159" cy="252" rx="20" ry="3.5" fill="#1A1714" opacity=".12"/></svg>`

export function WelcomeArt() {
  return <div dangerouslySetInnerHTML={{ __html: SVG }} />
}
