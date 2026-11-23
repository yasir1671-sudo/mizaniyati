// أيقونات SVG خطية مرسومة على شبكة 24×24 (بدل الإيموجي)
const SVG_NS = 'http://www.w3.org/2000/svg';

export const ICONS = {
  // واجهة
  home: 'M3.5 10.5 12 4l8.5 6.5M5.5 9v10.5h4.5v-5.5h4v5.5h4.5V9',
  list: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
  plan: 'M4.5 7A2 2 0 0 1 6.5 5h11a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2zM4.5 10h15M9 3v4M15 3v4M8.5 14h3M8.5 17h6',
  wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H17v3M4 7.5V17a2.5 2.5 0 0 0 2.5 2.5H20V8H6.5A2.5 2.5 0 0 1 4 5.5M16.5 13.75h.01',
  plus: 'M12 5v14M5 12h14',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  chevR: 'M9.5 6l6 6-6 6',
  chevL: 'M14.5 6l-6 6 6 6',
  chevD: 'M6 9.5l6 6 6-6',
  chevU: 'M6 14.5l6-6 6 6',
  image: 'M4.5 5.5h15v13h-15zM4.5 15.5l4-4 3.5 3.5 2.5-2.5 5 5M15 9.25h.01',
  key: 'M14.5 4.5a5 5 0 1 0-4.1 7.85L4.5 18.25V20.5H7v-2h2v-2h2l1.15-1.15A5 5 0 0 0 14.5 4.5zM16 8h.01',
  external: 'M13.5 4.5h6v6M19.5 4.5l-8 8M17 13.5v6h-12.5v-12.5h6',
  toTop: 'M6 4.5h12M12 9v10.5M7.5 13.5 12 9l4.5 4.5',
  sort: 'M7.5 19.5v-15M4.5 7.5l3-3 3 3M16.5 4.5v15M13.5 16.5l3 3 3-3',
  sliders: 'M4 7h8M16 7h4M4 17h3M11 17h9M14 5v4M9 15v4',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5z',
  eyeOff: 'M3.5 3.5l17 17M10.4 5.7A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-2.9 3.6M6.7 7.2C4 8.9 2.5 12 2.5 12S6 18.5 12 18.5a8.8 8.8 0 0 0 4.3-1.1M10 10.1a2.75 2.75 0 0 0 3.9 3.9',
  lock: 'M6.5 11h11v9h-11zM8.75 11V8.25a3.25 3.25 0 0 1 6.5 0V11M12 14.5v2',
  search: 'M10.75 4.5a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5zM19.5 19.5l-4.25-4.25',
  trash: 'M4.5 7h15M10 11v5.5M14 11v5.5M6.5 7l.9 12.5h9.2L17.5 7M9.5 7V4.5h5V7',
  edit: 'M4.5 19.5h3.75L18.6 9.15a2.1 2.1 0 0 0-3-3L5.25 16.5v3M13.75 8l3 3',
  swap: 'M7 7.5h12.5l-3-3M17 16.5H4.5l3 3',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5V9H15',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chart: 'M5 19.5V11M12 19.5V5M19 19.5V14M3.5 19.5h17',
  trend: 'M4 18.5h16M5 15l4.5-4.5 3.5 3L19 7M15 7h4v4',
  target: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 11.25a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z',
  bag: 'M5.5 8.5h13l-1 11h-11zM9 8.5V7a3 3 0 0 1 6 0v1.5',
  exchange: 'M8 3.75a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5zM16 11.75a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5zM14.5 4.5h2.5a2.5 2.5 0 0 1 2.5 2.5v1.5M9.5 19.5H7A2.5 2.5 0 0 1 4.5 17v-1.5',
  people: 'M9 11.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5zM3.25 19.75a5.75 5.75 0 0 1 11.5 0M15.75 4.9a3.25 3.25 0 0 1 0 6.2M17.75 14.4a5.75 5.75 0 0 1 3 5.35',
  moon:'M19.5 14.25A7.75 7.75 0 1 1 9.75 4.5a6.25 6.25 0 0 0 9.75 9.75zM17 4l.6 1.4L19 6l-1.4.6L17 8l-.6-1.4L15 6l1.4-.6z',
  bulb: 'M9.5 18h5M10.5 21h3M12 3.5a5.75 5.75 0 0 0-3.6 10.2c.7.6 1.1 1.4 1.1 2.3h5c0-.9.4-1.7 1.1-2.3A5.75 5.75 0 0 0 12 3.5z',
  mic: 'M12 3.5a2.75 2.75 0 0 0-2.75 2.75v5.5a2.75 2.75 0 0 0 5.5 0v-5.5A2.75 2.75 0 0 0 12 3.5zM5.75 11a6.25 6.25 0 0 0 12.5 0M12 17.25v3.25',
  send: 'M20 4 3.5 11l6.5 2.5L12.5 20zM20 4l-10 9.5',
  backspace: 'M20.5 6H9L3.5 12 9 18h11.5zM15.5 9.5l-5 5M10.5 9.5l5 5',
  shield: 'M12 3.5l7.5 2.75v5.5c0 4.4-3.1 7.7-7.5 8.75-4.4-1.05-7.5-4.35-7.5-8.75v-5.5z',
  sparkle: 'M12 3.5l1.9 5 5.1 1.9-5.1 1.9-1.9 5-1.9-5L5 10.4l5.1-1.9zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  download: 'M12 4v10.5M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14',
  upload: 'M12 19.5V9M7.5 13.5 12 9l4.5 4.5M5 4.5h14',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  tag: 'M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7zM7.75 7.75h.01',
  arrowDown: 'M12 5v14M6.5 13.5 12 19l5.5-5.5',
  arrowUp: 'M12 19V5M6.5 10.5 12 5l5.5 5.5',
  coins: 'M3.5 7c0-1.4 2.5-2.5 5.5-2.5s5.5 1.1 5.5 2.5S12 9.5 9 9.5 3.5 8.4 3.5 7zM3.5 7v4.5C3.5 12.9 6 14 9 14M3.5 11.5V16c0 1.4 2.5 2.5 5.5 2.5M9.5 13c0-1.4 2.5-2.5 5.5-2.5s5.5 1.1 5.5 2.5-2.5 2.5-5.5 2.5S9.5 14.4 9.5 13zM9.5 13v4.5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V13',
  calendar: 'M4.5 7A2 2 0 0 1 6.5 5h11a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2zM4.5 10h15M9 3v4M15 3v4',
  note: 'M6 3.5h8.5L18 7v13.5H6zM14 3.5V7.5h4M9 12h6M9 15.5h4',
  install: 'M8 3.5h8a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM12 7.5v6.5M9.5 11.5 12 14l2.5-2.5',
  more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  grid: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5.5M12 7.75h.01',
  alert: 'M12 4 2.75 19.5h18.5zM12 10v4.5M12 17.25h.01',
  flag: 'M5.5 20.5V4.5M5.5 5h11.5l-2.5 4 2.5 4H5.5',

  // فئات المصاريف
  food: 'M6.5 3.5V9a2 2 0 0 0 4 0V3.5M8.5 11v9.5M17 20.5v-17c-2 1.4-3 4-3 7v3h3',
  coffee: 'M4.5 9.5h11v4.5a4.5 4.5 0 0 1-4.5 4.5H9a4.5 4.5 0 0 1-4.5-4.5zM15.5 10.5h1.25a2.25 2.25 0 0 1 0 4.5H15.5M8 3.5v2.5M11.5 3.5v2.5',
  cart: 'M3.5 4.5h2l2.1 10.2a1.4 1.4 0 0 0 1.4 1.1h8.2a1.4 1.4 0 0 0 1.4-1.1L20 8H6.3M9.5 19.75h.01M17 19.75h.01',
  car: 'M4.5 16v-4l2.1-5a1.6 1.6 0 0 1 1.5-1h7.8a1.6 1.6 0 0 1 1.5 1l2.1 5v4M4.5 12h15M3.5 16h17v2.5h-17zM7.75 14.25h.01M16.25 14.25h.01',
  bus: 'M6.5 3.5h11a2 2 0 0 1 2 2v12h-15v-12a2 2 0 0 1 2-2zM4.5 11.5h15M8 17.5v2.5M16 17.5v2.5M8 14.5h.01M16 14.5h.01',
  fuel: 'M4.5 20.5v-15a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15M3.5 20.5h11M4.5 10.5h9M13.5 8l3 3v5.5a1.5 1.5 0 0 0 3 0V9l-3-3',
  receipt: 'M6 3.5h12v17l-2.5-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 20.5zM9 8h6M9 11.5h6M9 15h3.5',
  bolt: 'M13 3.5 5.5 13.5h6l-1 7 8-10h-6z',
  wifi: 'M3 9.5a13 13 0 0 1 18 0M6 13a8.5 8.5 0 0 1 12 0M9 16.4a4.2 4.2 0 0 1 6 0M12 19.5h.01',
  droplet: 'M12 3.5s6 6.4 6 10.75a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z',
  flame: 'M12 3.5c1 3.4 5 5.3 5 9.75a5 5 0 0 1-10 0c0-2.1.9-3.5 2-4.4.3 1.5 1 2.4 2 2.9 0-3.4-.4-5.3 1-8.25z',
  phone: 'M8 3.5h8a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM11 17.5h2',
  house: 'M3.5 11 12 4.5l8.5 6.5M5.5 9.5v10.5h13V9.5M10 20v-5.5h4V20',
  pill: 'M4.75 13.25 13.25 4.75a4.24 4.24 0 0 1 6 6l-8.5 8.5a4.24 4.24 0 0 1-6-6zM9 9l6 6',
  shirt: 'M8.5 3.5 3.5 6.5l2 4 2.5-1.25V20.5h8V9.25l2.5 1.25 2-4-5-3c-.5 1.4-1.9 2.4-3.5 2.4S9 4.9 8.5 3.5z',
  gift: 'M4.5 11h15v9.5h-15zM3.5 7.5h17V11h-17zM12 7.5v13M12 7.5C10.5 4.6 7 4.2 7 6.3S10 7.5 12 7.5zM12 7.5c1.5-2.9 5-3.3 5-1.2S14 7.5 12 7.5z',
  heart: 'M12 20s-7.5-4.6-7.5-10.1A4.25 4.25 0 0 1 12 7.2a4.25 4.25 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z',
  box: 'M3.75 7.5 12 3.25l8.25 4.25v9L12 20.75 3.75 16.5zM3.75 7.5 12 11.75l8.25-4.25M12 11.75v9',
  book: 'M5 5.5A2 2 0 0 1 7 3.5h12v14H7a2 2 0 0 0-2 2zM5 19.5v-14M9 7.5h6',
  grad: 'M2.5 9.5 12 4.75l9.5 4.75L12 14.25zM6.5 11.5v4.5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-4.5M21.5 9.5v5',
  game: 'M7.5 8.5h9a4 4 0 0 1 4 4v2a2.5 2.5 0 0 1-4.5 1.5L14.75 14.5h-5.5L8 16a2.5 2.5 0 0 1-4.5-1.5v-2a4 4 0 0 1 4-4zM8.5 10.75v3M7 12.25h3M15.75 11.25h.01M17.75 13.25h.01',
  scissors: 'M6.5 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6.5 15a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8.5 8.25 20 16.5M8.5 15.75 20 7.5',
  wrench: 'M14.5 4.25a4.5 4.5 0 0 0-4.1 6.1L4.25 16.5a2.1 2.1 0 0 0 3 3l6.15-6.15a4.5 4.5 0 0 0 6.1-4.1l-2.75 1.25-2.25-2.25z',
  plane: 'M20.5 3.5 3.5 10.75l6.75 3 3 6.75zM20.5 3.5 10.25 13.75',
  paw: 'M12 12.5c-3 0-5.5 2.6-5.5 4.6 0 1.4 1.1 2.4 2.5 2.4 1 0 1.9-.5 3-.5s2 .5 3 .5c1.4 0 2.5-1 2.5-2.4 0-2-2.5-4.6-5.5-4.6zM6 8.25a1.5 1.75 0 1 0 0 3.5 1.5 1.75 0 0 0 0-3.5zM18 8.25a1.5 1.75 0 1 0 0 3.5 1.5 1.75 0 0 0 0-3.5zM9.5 4.25a1.5 1.75 0 1 0 0 3.5 1.5 1.75 0 0 0 0-3.5zM14.5 4.25a1.5 1.75 0 1 0 0 3.5 1.5 1.75 0 0 0 0-3.5z',
  baby: 'M12 4.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM9.5 11h.01M14.5 11h.01M10 14.25c1.2.8 2.8.8 4 0M12 4.5c0 1.5 1 2.5 2 2.5',
  card: 'M3.5 6h17v12h-17zM3.5 10h17M7 14.5h3.5',
  dumbbell: 'M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11',
  film: 'M4.5 5h15v14h-15zM4.5 9h15M4.5 15h15M8.5 5v4M15.5 5v4M8.5 15v4M15.5 15v4',
  laptop: 'M5.5 5.5h13v9.5h-13zM3 19h18l-2.5-4h-13z',
  sofa: 'M5.5 10V8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v2M3.5 12a2 2 0 0 1 4 0v2h9v-2a2 2 0 0 1 4 0v5h-17zM5.5 17v2M18.5 17v2',
  fridge: 'M7 3.5h10v17H7zM7 10h10M10 6v2M10 13v3',
  motor: 'M5.5 14.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18.5 14.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8.5 17.5h6l3-6h-4l-2-3h-3M14.5 11.5l-3 6',
  watch: 'M9.25 6.25 10 3.5h4l.75 2.75M9.25 17.75 10 20.5h4l.75-2.75M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM12 9.25V12l1.75 1.25',
  headphones: 'M4.5 15v-3a7.5 7.5 0 0 1 15 0v3M4.5 15h3v5h-2a1 1 0 0 1-1-1zM19.5 15h-3v5h2a1 1 0 0 0 1-1z',
  camera: 'M4 8h3l2-2.5h6L17 8h3v11H4zM12 10.25a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5z',
  ring: 'M8.75 3.5h6.5L13.5 6.5h-3zM12 7.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z',
  kaaba: 'M4 7.25 12 3.5l8 3.75v9.5L12 20.5l-8-3.75zM4 7.25 12 11l8-3.75M12 11v9.5M4 10.25 12 14l8-3.75',
  pin: 'M12 20.5s6-5.5 6-10.75a6 6 0 0 0-12 0C6 15 12 20.5 12 20.5zM12 7.25a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  store: 'M4 9.5 5.5 4.5h13L20 9.5M4 9.5h16v1a2.67 2.67 0 0 1-5.33 0 2.67 2.67 0 0 1-5.34 0A2.67 2.67 0 0 1 4 10.5zM5.5 13v7.5h13V13M10 20.5V16h4v4.5',
  tv: 'M3.5 6h17v11h-17zM8.5 20.5h7M9 3.5l3 2.5 3-2.5',
  music: 'M9 18V5.5l10-2V16M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  smoke: 'M3.5 15.5h13v3h-13zM18.5 15.5v3M20.5 15.5v3M17 11.5c0-1.5 2-1.5 2-3s-1-1.5-1-3',

  // فئات الدخل
  briefcase: 'M4 8h16v11.5H4zM9 8V5.75a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V8M4 13.25h16',
  toolbox: 'M3.5 10h17v9.5h-17zM8.5 10V7a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3M3.5 14h17M10.75 13v2.25h2.5V13',
  plusCircle: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 8.25v7.5M8.25 12h7.5',
  bank: 'M3.5 9.5 12 4.5l8.5 5M5.5 9.5v8M10 9.5v8M14 9.5v8M18.5 9.5v8M3.5 20h17',
  cash: 'M3 7h18v10H3zM12 9.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5zM6 10v4M18 10v4',
};

// أيقونات بخط أعرض (متل النقاط)
const BOLD = new Set(['more']);

export function icon(name, size = 22, { stroke } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', stroke || (BOLD.has(name) ? 2.8 : 1.75));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name] || ICONS.tag);
  svg.append(path);
  return svg;
}

// ألوان الفئات (تدرّجات هادئة تناسب الخلفية الداكنة)
export const TINTS = {
  mint: '#3DD39A',
  teal: '#3BB8C8',
  blue: '#5A9BEA',
  violet: '#A685EA',
  pink: '#E46FA3',
  coral: '#EC7A66',
  amber: '#E6A64B',
  gold: '#D9B45A',
  sage: '#86C29C',
  slate: '#8C95AA',
};
export const TINT_KEYS = Object.keys(TINTS);
export const tintHex = (key) => TINTS[key] || TINTS.slate;

// الأيقونات اللي بتطلع باختيار أيقونة الفئة أو الغرض أو الهدف
export const CATEGORY_ICON_CHOICES = [
  'food', 'coffee', 'cart', 'car', 'bus', 'fuel', 'receipt', 'bolt', 'wifi', 'droplet', 'flame', 'phone',
  'house', 'pill', 'shirt', 'gift', 'heart', 'book', 'grad', 'game', 'scissors', 'wrench', 'plane', 'paw',
  'baby', 'card', 'dumbbell', 'film', 'music', 'tv', 'smoke', 'store', 'kaaba', 'box', 'tag',
  'briefcase', 'trend', 'toolbox', 'exchange', 'bank', 'cash', 'coins', 'plusCircle',
];
export const ITEM_ICON_CHOICES = [
  'bag', 'pin', 'laptop', 'phone', 'sofa', 'fridge', 'car', 'motor', 'watch', 'headphones', 'camera', 'game',
  'shirt', 'ring', 'house', 'wrench', 'plane', 'grad', 'pill', 'kaaba', 'gift', 'tv', 'box', 'moon',
];
export const GOAL_ICON_CHOICES = ['target', 'shield', 'trend', 'house', 'car', 'ring', 'kaaba', 'grad', 'plane', 'laptop', 'baby', 'store'];

// تحويل الإيموجي القديمة لأيقونات (للبيانات المحفوظة قبل التحديث)
const EMOJI_MAP = {
  '🍽️': 'food', '☕': 'coffee', '🛒': 'cart', '🚕': 'car', '🧾': 'receipt', '🏠': 'house', '💊': 'pill', '👕': 'shirt',
  '🎁': 'gift', '🤲': 'heart', '📦': 'box', '📚': 'book', '🎓': 'grad', '🎮': 'game', '✂️': 'scissors', '🔧': 'wrench',
  '✈️': 'plane', '🐾': 'paw', '👶': 'baby', '💳': 'card', '📱': 'phone', '💼': 'briefcase', '📈': 'trend', '🧰': 'toolbox',
  '🤝': 'exchange', '➕': 'plusCircle', '🏷️': 'tag', '🛍️': 'bag', '📌': 'pin', '💻': 'laptop', '🛋️': 'sofa', '🧊': 'fridge',
  '🚗': 'car', '🏍️': 'motor', '⌚': 'watch', '🎧': 'headphones', '📷': 'camera', '👔': 'shirt', '💍': 'ring', '🩺': 'pill',
  '🕋': 'kaaba', '🎯': 'target', '🛟': 'shield', '🏪': 'store',
};
export function iconKey(value, fallback = 'tag') {
  if (value && ICONS[value]) return value;
  return EMOJI_MAP[value] || fallback;
}

// مربّع ملوّن فيه أيقونة (للفئات والأغراض)
export function badge(name, tint = 'slate', size = 40) {
  const el = document.createElement('span');
  el.className = 'badge';
  el.style.setProperty('--tint', tintHex(tint));
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.setAttribute('aria-hidden', 'true');
  el.append(icon(iconKey(name), Math.round(size * 0.5)));
  return el;
}
