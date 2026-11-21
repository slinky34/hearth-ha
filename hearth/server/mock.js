// In-memory stand-in for the Home Assistant REST API, used when Hearth runs
// without HA (local development / trying it out). Covers only what Hearth calls.

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function localIso(d) {
  const off = -d.getTimezoneOffset();
  const a = Math.abs(off);
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${off >= 0 ? '+' : '-'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const CALENDARS = [
  { entity_id: 'calendar.family', name: 'Family' },
  { entity_id: 'calendar.jordan', name: 'Jordan' },
  { entity_id: 'calendar.alex', name: 'Alex' },
  { entity_id: 'calendar.sam', name: 'Sam' },
];

// Recurring timed events: by weekday (0 = Sunday) or by day of month.
const RECURRING = [
  { cal: 'calendar.family', days: [1, 2, 3, 4, 5], at: [7, 45], mins: 30, summary: 'School drop-off' },
  { cal: 'calendar.jordan', days: [1, 2, 3, 4, 5], at: [9, 0], mins: 30, summary: 'Team standup' },
  { cal: 'calendar.sam', days: [1, 3], at: [17, 0], mins: 90, summary: 'Soccer practice', location: 'Riverside Park' },
  { cal: 'calendar.alex', days: [2], at: [16, 0], mins: 45, summary: 'Piano lesson', location: 'Ms. Rivera’s studio' },
  { cal: 'calendar.jordan', days: [4], at: [12, 30], mins: 60, summary: 'Lunch with Priya' },
  { cal: 'calendar.alex', days: [4], at: [15, 30], mins: 60, summary: 'Art club' },
  { cal: 'calendar.jordan', days: [3], at: [19, 0], mins: 90, summary: 'Book club' },
  { cal: 'calendar.sam', days: [6], at: [9, 0], mins: 75, summary: 'Soccer game', location: 'Field 3' },
  { cal: 'calendar.family', days: [6], at: [10, 30], mins: 90, summary: 'Pancake brunch' },
  { cal: 'calendar.family', days: [0], at: [18, 0], mins: 120, summary: 'Family movie night' },
  { cal: 'calendar.alex', dates: [6, 19], at: [13, 0], mins: 45, summary: 'Dentist', location: 'Smile Dental' },
  { cal: 'calendar.jordan', dates: [10, 24], at: [17, 30], mins: 30, summary: 'Pick up dry cleaning' },
];
const ALL_DAY = [
  { cal: 'calendar.family', dates: [11], len: 1, summary: 'No school' },
  { cal: 'calendar.sam', dates: [8], len: 1, summary: 'Sam’s birthday 🎂' },
  { cal: 'calendar.family', dates: [22], len: 3, summary: 'Grandma visiting' },
];

export function createMockHA() {
  const created = [];
  let uid = 1;
  const todos = {
    'todo.groceries': [
      ['Milk', 0], ['Eggs', 0], ['Bananas', 0], ['Tortillas', 0], ['Coffee beans', 0], ['Spinach', 1], ['Bread', 1],
    ],
    'todo.household': [['Call plumber', 0], ['Return library books', 0], ['Order birthday gift', 0], ['Change air filter', 1]],
  };
  for (const k of Object.keys(todos))
    todos[k] = todos[k].map(([summary, done]) => ({ uid: String(uid++), summary, status: done ? 'completed' : 'needs_action' }));

  function eventsFor(cal, start, end) {
    const out = [];
    for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d < end; d = addDays(d, 1)) {
      for (const r of RECURRING) {
        if (r.cal !== cal) continue;
        if (r.days ? !r.days.includes(d.getDay()) : !r.dates.includes(d.getDate())) continue;
        const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), r.at[0], r.at[1]);
        const e = new Date(s.getTime() + r.mins * 60000);
        out.push({ uid: `${cal}-${dateKey(d)}-${r.summary}`, summary: r.summary, location: r.location, start: { dateTime: localIso(s) }, end: { dateTime: localIso(e) } });
      }
      for (const a of ALL_DAY) {
        if (a.cal !== cal || !a.dates.includes(d.getDate())) continue;
        out.push({ uid: `${cal}-${dateKey(d)}-${a.summary}`, summary: a.summary, start: { date: dateKey(d) }, end: { date: dateKey(addDays(d, a.len)) } });
      }
    }
    for (const c of created) {
      if (c.cal !== cal) continue;
      const s = new Date(c.start.dateTime || c.start.date + 'T00:00');
      const e = new Date(c.end.dateTime || c.end.date + 'T00:00');
      if (s < end && e > start) out.push(c.event);
    }
    return out;
  }

  function forecast() {
    const conds = ['sunny', 'partlycloudy', 'cloudy', 'rainy', 'partlycloudy', 'sunny', 'snowy'];
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => ({
      datetime: localIso(addDays(today, i)),
      condition: conds[(today.getDate() + i) % conds.length],
      temperature: 52 + ((i * 7) % 11),
      templow: 38 + ((i * 5) % 8),
      precipitation_probability: [5, 10, 40, 80, 20, 0, 60][(today.getDate() + i) % 7],
    }));
  }

  const TRACKS = [
    ['Here Comes the Sun', 'The Beatles', 'Abbey Road', '#F2A541'],
    ['Lovely Day', 'Bill Withers', 'Menagerie', '#6CBF84'],
    ['September', 'Earth, Wind & Fire', 'The Best Of', '#9B7BEA'],
    ['Dreams', 'Fleetwood Mac', 'Rumours', '#5B8DEF'],
  ];
  const players = {
    'media_player.kitchen': { name: 'Kitchen Speaker', state: 'playing', track: 0, volume: 0.35, started: Date.now() },
    'media_player.living_room': { name: 'Living Room', state: 'paused', track: 2, volume: 0.5, started: Date.now() },
  };
  // Like a real setup: the speaker's native entity can't skip; its Music Assistant twin can.
  players['media_player.kitchen_2'] = players['media_player.kitchen'];
  const MASS = new Set(['media_player.living_room', 'media_player.kitchen_2']);
  const toggles = {
    'light.kitchen': ['Kitchen Lights', 'on'],
    'light.living_room': ['Living Room Lamp', 'off'],
    'switch.coffee_maker': ['Coffee Maker', 'off'],
    'fan.bedroom': ['Bedroom Fan', 'off'],
    'input_boolean.guest_mode': ['Guest Mode', 'off'],
    'scene.movie_time': ['Movie Time', 'scening'],
    'script.good_night': ['Good Night', 'off'],
  };
  let doorbell = 'off';
  const grocyList = [
    { id: 1, product_id: 3, note: 'Oat milk', amount: 2, done: 0, product: { name: 'Oat milk' } },
    { id: 2, product_id: 7, note: '', amount: 1, done: 0, product: { name: 'Sourdough bread' } },
    { id: 3, product_id: 9, note: 'Apples', amount: 6, done: 1, product: { name: 'Apples' } },
  ];
  const grocyChores = [
    { id: 1, name: 'Clean fridge', next_estimated_execution_time: localIso(addDays(new Date(), -1)) },
    { id: 2, name: 'Water garden', next_estimated_execution_time: localIso(new Date()) },
    { id: 3, name: 'Change bed sheets', next_estimated_execution_time: localIso(addDays(new Date(), 3)) },
  ];

  function playerState(id) {
    const p = players[id];
    const [title, artist, album] = TRACKS[p.track];
    return {
      entity_id: id,
      state: p.state,
      last_updated: new Date(p.started).toISOString(),
      attributes: {
        friendly_name: p.name,
        media_title: title,
        media_artist: artist,
        media_album_name: album,
        media_duration: 210,
        media_position: p.state === 'playing' ? 0 : 74,
        media_position_updated_at: new Date(p.started).toISOString(),
        volume_level: p.volume,
        shuffle: Boolean(p.shuffle),
        repeat: p.repeat ?? 'off',
        is_volume_muted: false,
        entity_picture: `/api/media_player_proxy/${id}`,
        supported_features: id === 'media_player.kitchen' ? 1 | 4 | 16384 : 0xffff | 262144,
        ...(MASS.has(id) ? { mass_player_type: 'player', active_queue: id } : {}),
      },
    };
  }

  function states() {
    const ts = (id, [name, state], extra = {}) => ({ entity_id: id, state, attributes: { friendly_name: name, ...extra } });
    return [
      ...CALENDARS.map((c) => ({ entity_id: c.entity_id, state: 'off', attributes: { friendly_name: c.name } })),
      { entity_id: 'todo.groceries', state: '5', attributes: { friendly_name: 'Groceries' } },
      { entity_id: 'todo.household', state: '3', attributes: { friendly_name: 'Household' } },
      { entity_id: 'todo.sam_chores', state: '2', attributes: { friendly_name: 'Sam (TaskMate)' } },
      { entity_id: 'weather.home', state: forecast()[0].condition, attributes: { friendly_name: 'Home', temperature: 54, temperature_unit: '°F', humidity: 61 } },
      ...Object.keys(players).map(playerState),
      ...Object.entries(toggles).map(([id, v]) => ts(id, v, id.startsWith('light.') && v[1] === 'on' ? { brightness: 200 } : {})),
      ts('camera.front_door', ['Front Door Camera', 'idle']),
      ts('camera.driveway', ['Driveway', 'idle']),
      ts('camera.backyard', ['Backyard', 'idle']),
      ts('binary_sensor.front_door_person_occupancy', ['Front Door Person occupancy', 'off'], { device_class: 'occupancy' }),
      ts('binary_sensor.doorbell', ['Doorbell', doorbell]),
      ts('tts.google_translate_en_com', ['Google Translate en com', 'unknown']),
      ts('switch.kitchen_tablet_screen', ['Kitchen Tablet Screen', 'on']),
      ts('person.jordan', ['Jordan', 'home']),
      ts('person.alex', ['Alex', 'not_home']),
      ts('person.sam', ['Sam', 'home']),
      ts('sensor.living_room_temperature', ['Living Room Temperature', '70.5'], { unit_of_measurement: '°F', device_class: 'temperature' }),
      ts('sensor.front_door_battery', ['Front Door Battery', '82'], { unit_of_measurement: '%', device_class: 'battery' }),
      ts('binary_sensor.front_door', ['Front Door', 'off'], { device_class: 'door' }),
      ts('sensor.grocy_shopping_list', ['Grocy shopping list', String(grocyList.length)], { items: grocyList }),
      ts('sensor.grocy_chores', ['Grocy chores', String(grocyChores.length)], { chores: grocyChores }),
      ts('sensor.grocy_expiring_products', ['Grocy expiring products', '2'], {
        products: [
          { id: 4, name: 'Greek yogurt', best_before_date: dateKey(addDays(new Date(), 1)), amount: 2 },
          { id: 5, name: 'Spinach', best_before_date: dateKey(addDays(new Date(), 2)), amount: 1 },
        ],
      }),
      ts('sensor.grocy_meal_plan', ['Grocy meal plan', '2'], {
        meals: [
          { day: dateKey(addDays(new Date(), 1)), recipe: { name: 'Lemon herb chicken' }, section: { name: 'Dinner' } },
          { day: dateKey(addDays(new Date(), 2)), recipe: { name: 'Overnight oats' }, section: { name: 'Breakfast' } },
        ],
      }),
    ];
  }

  const ok = (data) => ({ status: 200, data });
  const ids = (v) => (Array.isArray(v) ? v : [v]);

  // Shaped like Home Assistant's Mealie service responses (aiomealie dataclasses).
  const ing = (quantity, unit, food, note = '') => ({ quantity, unit, food, note, is_food: true, disable_amount: false, reference_id: String(uid++) });
  const step = (text, title = '') => ({ instruction_id: String(uid++), title, text, ingredient_references: [] });
  const RECIPES = [
    {
      recipe_id: 'r-tacos', slug: 'weeknight-tacos', name: 'Weeknight Tacos', recipe_yield: '4 servings', total_time: '30 minutes',
      description: 'Crispy-edged spiced beef tacos the whole family can build themselves.', color: '#F2A541', emoji: '🌮',
      ingredients: [ing(1, 'pound', 'ground beef'), ing(1, 'tablespoon', 'chili powder'), ing(1, 'teaspoon', 'cumin'), ing(0.5, 'teaspoon', 'salt'), ing(8, '', 'small tortillas'), ing(1, 'cup', 'shredded cheese'), ing(null, '', '', 'Lettuce, salsa, and lime to serve')],
      instructions: [step('Heat a large skillet over medium-high heat and add the beef. Break it up and cook for 8 minutes until browned.'), step('Stir in the chili powder, cumin, and salt with 1/4 cup water. Simmer for 5 minutes.'), step('Warm the tortillas in a dry pan, about 30 seconds per side.'), step('Set out the fillings and let everyone build their own tacos.')],
    },
    {
      recipe_id: 'r-pancakes', slug: 'banana-pancakes', name: 'Banana Pancakes', recipe_yield: '12 pancakes', total_time: '25 minutes',
      description: 'Fluffy Saturday pancakes with mashed banana.', color: '#E3B92F', emoji: '🥞',
      ingredients: [ing(2, 'cup', 'flour'), ing(2, 'tablespoon', 'sugar'), ing(1, 'tablespoon', 'baking powder'), ing(2, '', 'ripe bananas', 'mashed'), ing(1.5, 'cup', 'milk'), ing(2, '', 'eggs')],
      instructions: [step('Whisk the flour, sugar, and baking powder in a bowl.'), step('In another bowl mash the bananas, then whisk in the milk and eggs.'), step('Fold wet into dry until just combined. Let the batter rest for 5 minutes.'), step('Cook 1/4 cup scoops on a buttered griddle for 2 to 3 minutes per side.')],
    },
    {
      recipe_id: 'r-salmon', slug: 'sheet-pan-salmon', name: 'Sheet-Pan Salmon & Veggies', recipe_yield: '4 servings', total_time: '35 minutes',
      description: 'One pan, lemony salmon with roasted broccoli and potatoes.', color: '#E9736B', emoji: '🐟',
      ingredients: [ing(4, '', 'salmon fillets'), ing(1, 'pound', 'baby potatoes', 'halved'), ing(1, 'head', 'broccoli', 'cut into florets'), ing(3, 'tablespoon', 'olive oil'), ing(1, '', 'lemon')],
      instructions: [step('Heat the oven to 425°F.', 'Prep'), step('Toss the potatoes with half the oil and roast for 15 minutes.', 'Roast'), step('Add the broccoli and salmon, drizzle with the rest of the oil, and bake 12 to 15 minutes.'), step('Squeeze lemon over everything and serve.', 'Serve')],
    },
    {
      recipe_id: 'r-spag', slug: 'spaghetti-meatballs', name: 'Spaghetti & Meatballs', recipe_yield: '6 servings', total_time: '1 hour',
      description: 'Classic Sunday sauce with tender baked meatballs.', color: '#9B7BEA', emoji: '🍝',
      ingredients: [ing(1, 'pound', 'spaghetti'), ing(1, 'pound', 'ground beef'), ing(0.5, 'cup', 'breadcrumbs'), ing(1, '', 'egg'), ing(24, 'ounce', 'marinara sauce'), ing(null, '', '', 'Parmesan to serve')],
      instructions: [step('Mix the beef, breadcrumbs, and egg. Roll into 18 meatballs.'), step('Bake at 400°F for 20 minutes.'), step('Simmer the meatballs in the marinara for 10 minutes.'), step('Boil the spaghetti for 9 minutes, drain, and serve topped with meatballs.')],
    },
  ];
  const ALBUMS = [['Abbey Road', 'The Beatles'], ['Rumours', 'Fleetwood Mac'], ['Thriller', 'Michael Jackson'], ['Kind of Blue', 'Miles Davis'], ['Tapestry', 'Carole King'], ['Moana (Soundtrack)', 'Various Artists']];
  const SONGS = ['Here Comes the Sun', 'Lovely Day', 'September', 'Dreams', 'Superstition', 'Dancing Queen', 'Walking on Sunshine', 'Three Little Birds', 'Happy', 'Shake It Off', 'Mr. Blue Sky', 'Good Vibrations'];
  const ARTISTS = ['The Beatles', 'Bill Withers', 'Earth, Wind & Fire', 'Fleetwood Mac', 'Stevie Wonder', 'ABBA', 'Katrina & The Waves', 'Bob Marley', 'Pharrell Williams', 'Taylor Swift', 'ELO', 'The Beach Boys'];
  const strip = (r) => { const { color, emoji, ...rest } = r; return rest; };
  const base = (r) => ({ recipe_id: r.recipe_id, slug: r.slug, name: r.name, description: r.description, image: 'img', recipe_yield: r.recipe_yield, total_time: r.total_time });
  const mealplan = () => {
    const today = new Date();
    return [[0, 'dinner', 0], [1, 'dinner', 2], [2, 'breakfast', 1], [3, 'dinner', 3]].map(([d, type, ri], i) => ({
      mealplan_id: i + 1, entry_type: type, mealplan_date: dateKey(addDays(today, d)), title: '', description: '', recipe: base(RECIPES[ri]),
    }));
  };

  const COCKTAILS = [
    { id: 'margarita', name: 'Margarita', emoji: '🍹', color: '#6CBF84', description: 'Bright, tart, and salty-rimmed.', garnish: 'Lime wheel, salt rim', glass: 'Coupe', method: 'Shake',
      ingredients: [['Tequila', 50, 'ml'], ['Lime juice', 25, 'ml'], ['Triple sec', 20, 'ml'], ['Agave syrup', 5, 'ml', true]],
      instructions: '1. Rub a lime wedge around the rim and dip in salt.\n2. Add everything to a shaker with ice.\n3. Shake hard for 15 seconds.\n4. Strain into the glass.' },
    { id: 'old-fashioned', name: 'Old Fashioned', emoji: '🥃', color: '#F2A541', description: 'Whiskey, sugar, bitters. The classic.', garnish: 'Orange peel', glass: 'Rocks', method: 'Stir',
      ingredients: [['Bourbon', 60, 'ml'], ['Simple syrup', 7.5, 'ml'], ['Angostura bitters', 2, 'dashes']],
      instructions: '- Add syrup and bitters to a mixing glass.\n- Add bourbon and ice, then stir for 30 seconds.\n- Strain over a large ice cube and express the orange peel.' },
    { id: 'shirley-temple', name: 'Shirley Temple (no alcohol)', emoji: '🍒', color: '#E9736B', description: 'The kids’ favorite fizzy pink drink.', garnish: 'Maraschino cherry', glass: 'Highball', method: 'Build',
      ingredients: [['Ginger ale', 150, 'ml'], ['Grenadine', 15, 'ml'], ['Lime juice', 5, 'ml', true]],
      instructions: 'Fill a glass with ice.\nPour in the ginger ale, then the grenadine.\nTop with a cherry.' },
  ];
  const cSummary = (c) => ({ id: c.id, name: c.name, description: c.description, image: `api/bar/image?u=${encodeURIComponent('mock:' + c.id)}` });

  return {
    ring() {
      doorbell = 'on';
      setTimeout(() => (doorbell = 'off'), 4000);
    },
    cameraSnapshot(id = 'camera.front_door') {
      const t = new Date().toLocaleTimeString();
      const name = String(id).replace('camera.', '').replace(/_/g, ' ').toUpperCase();
      const scene = id === 'camera.driveway'
        ? '<rect x="0" y="420" width="1280" height="300" fill="#555b66"/><rect x="420" y="330" width="420" height="160" rx="40" fill="#5B8DEF"/><circle cx="500" cy="500" r="40" fill="#222"/><circle cx="760" cy="500" r="40" fill="#222"/>'
        : id === 'camera.backyard'
          ? '<rect x="0" y="380" width="1280" height="340" fill="#4f8a3f"/><circle cx="1050" cy="150" r="70" fill="#E3B92F"/><rect x="200" y="250" width="30" height="180" fill="#6b4a33"/><circle cx="215" cy="230" r="90" fill="#3f7a32"/>'
          : '<rect x="460" y="140" width="360" height="520" rx="12" fill="#6b4a33"/><circle cx="780" cy="400" r="12" fill="#e3b92f"/>';
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#2b3340"/>${scene}<text x="40" y="60" font-family="monospace" font-size="34" fill="#fff">${name}  ${t}</text></svg>`;
    },
    frigateEvents(labels) {
      const now = Date.now() / 1000;
      const all = [
        ['front_door', 'person', 120, 0.91], ['driveway', 'car', 600, 0.88], ['front_door', 'package', 1500, 0.79],
        ['backyard', 'dog', 2400, 0.84], ['driveway', 'person', 4000, 0.93], ['backyard', 'cat', 7200, 0.77],
      ];
      return all
        .filter(([, l]) => !labels.length || labels.includes(l))
        .map(([camera, label, ago, score], i) => ({ id: `${Math.floor(now - ago)}.0-mock${i}`, camera, label, start: now - ago, end: now - ago + 20, score }));
    },
    immichAlbums() {
      return [
        { id: '00000000-0000-4000-8000-00000000a001', name: 'Family 2026', count: 5 },
        { id: '00000000-0000-4000-8000-00000000a002', name: 'Summer Vacation', count: 4 },
      ];
    },
    immichAssets(albums, favorites) {
      const ids = [];
      albums.forEach((a, i) => { for (let k = 0; k < 4; k++) ids.push(`00000000-0000-4000-8000-0000000${i}0${k}b0`.slice(0, 36)); });
      if (favorites) ids.push('00000000-0000-4000-8000-000000000f01');
      return ids;
    },
    immichArt(id) {
      const colors = ['#5B8DEF', '#6CBF84', '#F2A541', '#E77FB4', '#9B7BEA'];
      const c = colors[parseInt(id.slice(-4, -2), 16) % colors.length] || colors[0];
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#fff4e6"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/><text x="800" y="560" font-family="sans-serif" font-size="110" fill="#fff" text-anchor="middle">Immich photo</text></svg>`;
    },
    places(q) {
      const all = [
        { label: 'Tara Morgan Elementary School', sub: '410 Oak St, Springfield, IL, United States' },
        { label: 'Taramore Park', sub: 'Lakeview Dr, Springfield, IL, United States' },
        { label: 'Riverside Park', sub: '200 River Rd, Springfield, IL, United States' },
        { label: 'Rec Center', sub: '55 Main St, Springfield, IL, United States' },
        { label: 'Smile Dental', sub: '12 Elm Ave, Springfield, IL, United States' },
      ];
      const n = q.toLowerCase().replace(/\s+/g, '');
      return all.filter((p) => p.label.toLowerCase().replace(/\s+/g, '').includes(n.slice(0, 5)) || p.sub.toLowerCase().includes(q.toLowerCase()));
    },
    cocktails(q) {
      return COCKTAILS.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())).map(cSummary);
    },
    cocktail(id) {
      const c = COCKTAILS.find((x) => x.id === id) ?? COCKTAILS[0];
      return { ...cSummary(c), garnish: c.garnish, glass: c.glass, method: c.method, instructions: c.instructions,
        ingredients: c.ingredients.map(([name, amount, units, optional]) => ({ name, amount, amount_max: null, units, optional: Boolean(optional), note: null })) };
    },
    cocktailArt(id) {
      const c = COCKTAILS.find((x) => x.id === id) ?? COCKTAILS[0];
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.color}"/><stop offset="1" stop-color="#1f2430"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><text x="200" y="185" font-size="120" text-anchor="middle">${c.emoji}</text></svg>`;
    },
    ws(type, payload) {
      if (type === 'calendar/event/update' || type === 'calendar/event/delete') {
        const i = created.findIndex((c) => c.cal === payload.entity_id && c.event.uid === payload.uid);
        if (i < 0) return Promise.reject(new Error('This demo event is read-only (only events you add can be changed)'));
        if (type === 'calendar/event/delete') created.splice(i, 1);
        else {
          const e = payload.event;
          const start = e.dtstart.length > 10 ? { dateTime: e.dtstart } : { date: e.dtstart };
          const end = e.dtend.length > 10 ? { dateTime: e.dtend } : { date: e.dtend };
          created[i] = { cal: payload.entity_id, start, end, event: { uid: payload.uid, summary: e.summary, location: e.location, description: e.description, start, end } };
        }
        return Promise.resolve(null);
      }
      if (type !== 'media_player/browse_media') return Promise.reject(new Error(`Mock ws: ${type}`));
      const id = String(payload.media_content_id || '');
      const m = id.match(/^library:\/\/(playlist|album)\/(\d+)$/);
      if (!m) return Promise.reject(new Error('Unknown media id'));
      const n = Number(m[2]);
      const count = m[1] === 'album' ? 9 : 12;
      const title = m[1] === 'album' ? ALBUMS[n - 1]?.[0] : ['Family Favorites', 'Dinner Jazz', 'Kids Dance Party', 'Sunday Morning', 'Road Trip', 'Bedtime'][n - 1];
      const children = Array.from({ length: count }, (_, i) => {
        const k = (i + n * 3) % SONGS.length;
        return {
          title: SONGS[k], media_class: 'track', media_content_type: 'track', media_content_id: `library://track/${n * 100 + i}`,
          can_play: true, can_expand: false, thumbnail: null,
          title: `${ARTISTS[k]} - ${SONGS[k]}`,
        };
      });
      return Promise.resolve({ title, media_class: m[1], media_content_type: m[1], media_content_id: id, can_play: true, can_expand: true, thumbnail: null, children });
    },
    recipeArt(id) {
      const r = RECIPES.find((x) => x.recipe_id === id) ?? RECIPES[0];
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${r.color}"/><stop offset="1" stop-color="#fff4e6"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><text x="200" y="185" font-size="120" text-anchor="middle">${r.emoji}</text></svg>`;
    },
    albumArt(id) {
      const p = players[id];
      const [title, , , color] = TRACKS[p ? p.track : 0];
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#2b2a33"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="150" cy="150" r="70" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="10"/><circle cx="150" cy="150" r="14" fill="#fff" fill-opacity=".8"/><text x="150" y="270" font-family="sans-serif" font-size="20" fill="#fff" text-anchor="middle">${title.replace(/&/g, '&amp;')}</text></svg>`;
    },
    async handle(method, apiPath, body = {}) {
      const url = new URL(apiPath, 'http://mock');
      const p = url.pathname;
      if (method === 'GET' && p === '/calendars') return ok(CALENDARS);
      if (method === 'GET' && p.startsWith('/calendars/')) {
        const cal = p.split('/')[2];
        if (!CALENDARS.some((c) => c.entity_id === cal)) return { status: 404, data: { message: 'Entity not found' } };
        return ok(eventsFor(cal, new Date(url.searchParams.get('start')), new Date(url.searchParams.get('end'))));
      }
      if (method === 'GET' && p === '/states') return ok(states());
      if (method === 'GET' && p === '/services')
        return ok([{ domain: 'notify', services: { mobile_app_jordans_phone: {}, mobile_app_alexs_ipad: {}, persistent_notification: {}, send_message: {} } }]);
      if (method === 'GET' && p === '/config/config_entries/entry') {
        const domain = url.searchParams.get('domain');
        const all = [
          { entry_id: 'mock_mealie', domain: 'mealie', state: 'loaded', title: 'Mealie' },
          { entry_id: 'mock_mass', domain: 'music_assistant', state: 'loaded', title: 'Music Assistant' },
          { entry_id: 'mock_grocy', domain: 'grocy', state: 'loaded', title: 'Grocy' },
        ];
        return ok(domain ? all.filter((e) => e.domain === domain) : all);
      }
      if (method === 'GET' && p.startsWith('/states/')) {
        const s = states().find((x) => x.entity_id === p.split('/')[2]);
        return s ? ok(s) : { status: 404, data: { message: 'Entity not found' } };
      }
      if (method !== 'POST') return { status: 404, data: { message: 'Not found' } };

      const svc = p.replace('/services/', '').replace('/', '.');
      if (svc.startsWith('notify.')) {
        console.log(`[mock notify] ${svc}: ${body.title} — ${body.message}`);
        return ok([]);
      }
      const entities = ids(body.entity_id || []);
      switch (svc) {
        case 'todo.get_items': {
          const service_response = {};
          for (const e of entities) service_response[e] = { items: todos[e] || [] };
          return ok({ changed_states: [], service_response });
        }
        case 'todo.add_item':
          for (const e of entities) (todos[e] ||= []).push({ uid: String(uid++), summary: body.item, status: 'needs_action' });
          return ok([]);
        case 'todo.update_item':
          for (const e of entities) {
            const it = (todos[e] || []).find((i) => i.uid === body.item || i.summary === body.item);
            if (it) {
              if (body.status) it.status = body.status;
              if (body.rename) it.summary = body.rename;
            }
          }
          return ok([]);
        case 'todo.remove_item':
          for (const e of entities) todos[e] = (todos[e] || []).filter((i) => !ids(body.item).some((x) => x === i.uid || x === i.summary));
          return ok([]);
        case 'todo.remove_completed_items':
          for (const e of entities) todos[e] = (todos[e] || []).filter((i) => i.status !== 'completed');
          return ok([]);
        case 'weather.get_forecasts':
          return ok({ changed_states: [], service_response: Object.fromEntries(entities.map((e) => [e, { forecast: forecast() }])) });
        case 'calendar.create_event':
          for (const cal of entities) {
            const start = body.start_date_time ? { dateTime: localIso(new Date(body.start_date_time.replace(' ', 'T'))) } : { date: body.start_date };
            const end = body.end_date_time ? { dateTime: localIso(new Date(body.end_date_time.replace(' ', 'T'))) } : { date: body.end_date };
            const event = { uid: `created-${uid++}`, summary: body.summary, description: body.description, location: body.location, start, end };
            created.push({ cal, start, end, event });
          }
          return ok([]);
        case 'media_player.media_play_pause':
        case 'media_player.media_play':
        case 'media_player.media_pause':
          for (const e of entities) {
            const pl = players[e];
            if (!pl) continue;
            pl.state = svc.endsWith('play') ? 'playing' : svc.endsWith('pause') ? 'paused' : pl.state === 'playing' ? 'paused' : 'playing';
            pl.started = Date.now();
          }
          return ok([]);
        case 'media_player.media_next_track':
        case 'media_player.media_previous_track':
          if (entities.includes('media_player.kitchen'))
            return { status: 400, data: { message: 'Entity media_player.kitchen does not support this service.' } };
          for (const e of entities) {
            const pl = players[e];
            if (!pl) continue;
            pl.track = (pl.track + (svc.endsWith('next_track') ? 1 : TRACKS.length - 1)) % TRACKS.length;
            pl.started = Date.now();
          }
          return ok([]);
        case 'media_player.shuffle_set':
          for (const e of entities) if (players[e]) players[e].shuffle = Boolean(body.shuffle);
          return ok([]);
        case 'media_player.repeat_set':
          for (const e of entities) if (players[e]) players[e].repeat = body.repeat;
          return ok([]);
        case 'media_player.volume_set':
          for (const e of entities) if (players[e]) players[e].volume = Number(body.volume_level);
          return ok([]);
        case 'music_assistant.get_library':
          if (body.media_type === 'album')
            return ok({ changed_states: [], service_response: { items: ALBUMS.map((a, i) => ({ name: a[0], uri: `library://album/${i + 1}`, media_type: 'album', image: null, artists: [{ name: a[1] }] })) } });
          return ok({
            changed_states: [],
            service_response: {
              items: ['Family Favorites', 'Dinner Jazz', 'Kids Dance Party', 'Sunday Morning', 'Road Trip', 'Bedtime'].map((name, i) => ({
                name,
                uri: `library://playlist/${i + 1}`,
                media_type: 'playlist',
                image: null,
              })),
            },
          });
        case 'music_assistant.search': {
          const q = String(body.name || '').toLowerCase();
          const hit = (x) => x.toLowerCase().includes(q);
          const tracks = SONGS.map((name, i) => ({ media_type: 'track', name, uri: `library://track/${900 + i}`, image: null, artists: [{ name: ARTISTS[i] }] }))
            .filter((x) => hit(x.name) || hit(x.artists[0].name));
          const albums = ALBUMS.map((a, i) => ({ media_type: 'album', name: a[0], uri: `library://album/${i + 1}`, image: null, artists: [{ name: a[1] }] }))
            .filter((x) => hit(x.name) || hit(x.artists[0].name));
          const playlists = ['Family Favorites', 'Dinner Jazz', 'Kids Dance Party', 'Sunday Morning', 'Road Trip', 'Bedtime']
            .map((name, i) => ({ media_type: 'playlist', name, uri: `library://playlist/${i + 1}`, image: null })).filter((x) => hit(x.name));
          const artists = [...new Set(ARTISTS)].map((name, i) => ({ media_type: 'artist', name, uri: `library://artist/${i + 1}`, image: null })).filter((x) => hit(x.name));
          return ok({ changed_states: [], service_response: { tracks, albums, playlists, artists, radio: [] } });
        }
        case 'ai_task.generate_data': {
          const d = (n) => dateKey(addDays(new Date(), n));
          const events = [
            { title: 'Picture Day', date: d(6), allDay: true, location: 'Lincoln Elementary' },
            { title: 'Fall Concert', date: d(9), start: '18:30', end: '19:30', allDay: false, location: 'School gym' },
            { title: 'Bake Sale', date: d(13), start: '08:00', end: '11:00', allDay: false, location: 'Front lobby' },
          ];
          return ok({ changed_states: [], service_response: { conversation_id: 'x', data: '```json\n' + JSON.stringify(events, null, 2) + '\n```' } });
        }
        case 'waze_travel_time.get_travel_times':
          return ok({ changed_states: [], service_response: { routes: [{ duration: 12 + (String(body.destination).length % 20), distance: 6.4, name: 'Main St', street_names: ['Main St'] }] } });
        case 'tts.speak':
          console.log(`[mock tts] ${body.media_player_entity_id}: ${body.message}`);
          return ok([]);
        case 'music_assistant.play_media':
          if (entities.some((e) => !MASS.has(e)))
            return { status: 400, data: { message: `Entity ${entities[0]} is not a Music Assistant player` } };
          for (const e of entities) if (players[e]) Object.assign(players[e], { state: 'playing', track: (players[e].track + 1) % TRACKS.length, started: Date.now() });
          return ok([]);
        case 'light.toggle':
        case 'switch.toggle':
        case 'fan.toggle':
        case 'input_boolean.toggle':
          for (const e of entities) if (toggles[e]) toggles[e][1] = toggles[e][1] === 'on' ? 'off' : 'on';
          return ok([]);
        case 'scene.turn_on':
        case 'script.turn_on':
          return ok([]);
        case 'grocy.add_generic':
          grocyList.push({ id: grocyList.length + 10, product_id: 0, note: body.data?.note, amount: 1, done: 0 });
          return ok([]);
        case 'grocy.update_generic': {
          const it = grocyList.find((i) => i.id === Number(body.object_id));
          if (it) Object.assign(it, body.data);
          return ok([]);
        }
        case 'grocy.execute_chore': {
          const c = grocyChores.find((x) => x.id === Number(body.chore_id));
          if (c) c.next_estimated_execution_time = localIso(addDays(new Date(), 7));
          return ok([]);
        }
        case 'mealie.get_mealplan':
          return ok({ changed_states: [], service_response: { mealplan: mealplan() } });
        case 'mealie.get_recipes': {
          const q = String(body.search_terms || '').toLowerCase();
          const items = RECIPES.filter((r) => !q || r.name.toLowerCase().includes(q)).map(base);
          return ok({ changed_states: [], service_response: { recipes: { items } } });
        }
        case 'mealie.get_recipe': {
          const r = RECIPES.find((x) => x.slug === body.recipe_id || x.recipe_id === body.recipe_id);
          if (!r) return { status: 400, data: { message: 'Recipe not found' } };
          return ok({ changed_states: [], service_response: { recipe: { ...strip(r), image: 'img' } } });
        }
        case 'mealie.set_mealplan':
          console.log(`[mock mealie] planned ${body.recipe_id} for ${body.entry_type} on ${body.date}`);
          return ok({ changed_states: [], service_response: { mealplan: {} } });
        default:
          return { status: 400, data: { message: `Mock does not implement ${svc}` } };
      }
    },
  };
}
