// Shared visual identity for the visitor-facing screens (Login, Sign Up,
// Home, Tour). Golkonda Fort is known for two things after the walls
// themselves: the night-time Sound & Light show, and its centuries as the
// world's diamond-trading capital (the Koh-i-Noor passed through here). The
// palette borrows from both — a deep night-sky ground, and three jewel
// accents standing in for lamp-light brass, and gemstone gold/violet — in
// place of the generic dashboard slate/blue/emerald this app started with.
//
// The Admin panel (MasterScreen) intentionally keeps its original styling —
// out of scope for this pass.

export const colors = {
  // Ground
  bg: '#14101E',            // deep indigo-charcoal, the night sky over the fort
  bgSoft: 'rgba(10, 8, 16, 0.6)',   // recessed wells (inputs, inset panels)

  // Surfaces
  card: 'rgba(38, 31, 51, 0.7)',
  cardStrong: 'rgba(28, 23, 39, 0.92)',
  border: 'rgba(112, 91, 130, 0.35)',
  borderStrong: 'rgba(133, 108, 156, 0.55)',

  // Text
  ink: '#F4ECDD',           // warm parchment white
  inkMuted: '#AFA08F',      // warm taupe
  inkFaint: '#7C7284',      // dim plum-grey, for disabled/tertiary

  // Brass gold — primary accent (CTAs, active states, lamp-light)
  accent: '#D7A548',
  accentInk: '#231A0D',     // text/icon color when sitting on the gold accent
  accentSoft: 'rgba(215, 165, 72, 0.16)',

  // Jade — success / proximity / "now playing"
  success: '#5FAE86',
  successStrong: '#3E8B67',  // deeper variant for solid fills, keeps white/parchment text legible
  successInk: '#0E211A',
  successSoft: 'rgba(95, 174, 134, 0.16)',

  // Amethyst — secondary accent (floor changes, verification prompts)
  violet: '#A084C9',
  violetSoft: 'rgba(160, 132, 201, 0.16)',

  // Rust — exit / stop / errors
  danger: '#C1584B',
  dangerSoft: 'rgba(193, 88, 75, 0.16)',

  // Neutral control (secondary buttons, inactive icons)
  neutral: '#4E4360',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

export const shadow = (color, opacity = 0.25) => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: opacity,
  shadowRadius: 14,
  elevation: 6,
});
