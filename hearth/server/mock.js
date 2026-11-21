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
  const toggles = {
    'light.kitchen': ['Kitchen Lights', 'on'],
    'light.living_room': ['Living Room Lamp', 'off'],
    'switch.coffee_maker': ['Coffee Maker', 'off'],
    'fan.bedroom': ['Bedroom Fan', 'off'],
    'input_boolean.guest_mode': ['Guest Mode', 'off'],
    'scene.movie_time': ['Movie Time', 'scening'],
    'script.good_night': ['Good Night', 'off'],
  };
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
        is_volume_muted: false,
        entity_picture: `/api/media_player_proxy/${id}`,
        supported_features: 0xffff,
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

  return {
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
      if (method === 'GET' && p === '/config/config_entries/entry')
        return ok([{ entry_id: 'mock_mass', domain: 'music_assistant', state: 'loaded', title: 'Music Assistant' }]);
      if (method === 'GET' && p.startsWith('/states/')) {
        const s = states().find((x) => x.entity_id === p.split('/')[2]);
        return s ? ok(s) : { status: 404, data: { message: 'Entity not found' } };
      }
      if (method !== 'POST') return { status: 404, data: { message: 'Not found' } };

      const svc = p.replace('/services/', '').replace('/', '.');
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
          for (const e of entities) {
            const pl = players[e];
            if (!pl) continue;
            pl.track = (pl.track + (svc.endsWith('next_track') ? 1 : TRACKS.length - 1)) % TRACKS.length;
            pl.started = Date.now();
          }
          return ok([]);
        case 'media_player.volume_set':
          for (const e of entities) if (players[e]) players[e].volume = Number(body.volume_level);
          return ok([]);
        case 'music_assistant.get_library':
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
        case 'music_assistant.play_media':
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
        default:
          return { status: 400, data: { message: `Mock does not implement ${svc}` } };
      }
    },
  };
}
