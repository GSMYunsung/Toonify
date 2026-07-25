// "Organic" design system — warm cream + terracotta + sage green
export const FONTS = {
  heading: 'Caprasimo_400Regular',
};

const base = {
  neutral100: '#f9f4ed',
  neutral200: '#eee7db',
  neutral300: '#dcd3c4',
  neutral400: '#c0b6a5',
  neutral500: '#a19786',
  neutral600: '#82796a',
  neutral700: '#645c50',
  neutral800: '#474238',
  neutral900: '#2e2b25',

  accent100:  '#fff2eb',
  accent200:  '#ffe1d0',
  accent300:  '#ffc6a5',
  accent400:  '#f6a06b',
  accent500:  '#d67f48',
  accent600:  '#b2622d',
  accent700:  '#8c491a',
  accent800:  '#643312',

  accent2_100: '#f0fae1',
  accent2_200: '#e1eecc',
  accent2_300: '#ccdbb2',
  accent2_400: '#aebf92',
  accent2_500: '#8fa073',
};

export const lightTheme = {
  ...base,
  bg:      '#f5ead8',
  surface: '#ebddc5',
  text:    '#201e1d',
  muted:   'rgba(32,30,29,0.55)',
  divider: 'rgba(32,30,29,0.16)',

  accent:     '#c67139',
  accentText: '#f5ead8',

  // 3-cycle card background tints (index % 3)
  cardTints: ['#f0fae1', '#fff2eb', '#f9f4ed'],

  tagNewBg:        '#fff2eb',
  tagNewColor:     '#8c491a',
  tagReadBg:       '#eee7db',
  tagReadColor:    '#82796a',
  tagCompleteBg:   '#f0fae1',
  tagCompleteColor:'#4d6136',

  ctaBg:       '#2e2b25',
  ctaText:     '#f9f4ed',
  ctaChipBg:   '#ccdbb2',
  ctaChipColor:'#2e2b25',

  deleteBg:   '#643312',
  deleteText: '#ffffff',

  overlayBg:  'rgba(32,30,29,0.55)',
  shadowColor:'#2e2b25',

  // backwards-compat aliases used by unchanged code
  card:        '#ebddc5',
  cardNew:     '#fff2eb',
  textSub:     'rgba(32,30,29,0.55)',
  accentBg:    '#fff2eb',
  accentBorder:'rgba(198,113,57,0.22)',
  border:      'rgba(32,30,29,0.16)',
  inputBorder: 'rgba(32,30,29,0.24)',
  header:      '#f5ead8',
  sheet:       '#f5ead8',
  handle:      'rgba(32,30,29,0.18)',
  sectionText: 'rgba(32,30,29,0.55)',
  delete:      '#643312',
};

export const darkTheme = {
  ...base,
  bg:      '#2e2b25',
  surface: '#474238',
  text:    '#f9f4ed',
  muted:   '#c0b6a5',
  divider: '#645c50',

  accent:     '#f6a06b',
  accentText: '#2e2b25',

  cardTints: ['#5b5b4a', '#6a554c', '#474238'],

  tagNewBg:        'rgba(246,160,107,0.24)',
  tagNewColor:     '#ffc6a5',
  tagReadBg:       '#645c50',
  tagReadColor:    '#c0b6a5',
  tagCompleteBg:   'rgba(174,191,146,0.25)',
  tagCompleteColor:'#aebf92',

  ctaBg:       '#f9f4ed',
  ctaText:     '#2e2b25',
  ctaChipBg:   '#aebf92',
  ctaChipColor:'#2e2b25',

  deleteBg:   '#8c491a',
  deleteText: '#f9f4ed',

  overlayBg:  'rgba(0,0,0,0.65)',
  shadowColor:'#000000',

  card:        '#474238',
  cardNew:     'rgba(246,160,107,0.15)',
  textSub:     '#c0b6a5',
  accentBg:    'rgba(246,160,107,0.15)',
  accentBorder:'rgba(246,160,107,0.25)',
  border:      '#645c50',
  inputBorder: '#645c50',
  header:      '#2e2b25',
  sheet:       '#2e2b25',
  handle:      '#645c50',
  sectionText: '#c0b6a5',
  delete:      '#8c491a',
};
