// Sample menu used for new restaurants and for the in-browser demo.
// tools/build-seed.mjs turns this file into supabase/migrations/0002_sample_menu.sql,
// so the demo and real new restaurants always start with the same menu.

const g = (id, name_es, name_en, required, multi, choices) => ({ id, name_es, name_en, required, multi, choices });
const c = (id, name_es, name_en, price_cents = 0) => ({ id, name_es, name_en, price_cents });

export const SAMPLE_MENU = [
  {
    name_es: 'Para picar', name_en: 'To share', station: 'kitchen',
    items: [
      {
        name_es: 'Croquetas de jamón ibérico', name_en: 'Iberian ham croquettes',
        desc_es: 'Cremosas, hechas en casa cada mañana.', desc_en: 'Creamy, made in house every morning.',
        price_cents: 600, allergens: ['gluten', 'milk', 'eggs'],
        options: [g('size', 'Tamaño', 'Size', true, false, [
          c('half', 'Media ración (4 uds)', 'Half portion (4 pcs)'),
          c('full', 'Ración (8 uds)', 'Full portion (8 pcs)', 450),
        ])],
      },
      {
        name_es: 'Patatas bravas', name_en: 'Patatas bravas',
        desc_es: 'Patata frita con nuestra salsa brava.', desc_en: 'Fried potatoes with our spicy brava sauce.',
        price_cents: 550, allergens: ['eggs'],
        options: [g('sauce', 'Salsa', 'Sauce', true, false, [
          c('brava', 'Brava picante', 'Spicy brava'),
          c('alioli', 'Alioli', 'Garlic alioli'),
          c('mix', 'Mitad y mitad', 'Half and half'),
        ])],
      },
      {
        name_es: 'Pimientos de Padrón', name_en: 'Padrón peppers',
        desc_es: 'Unos pican y otros no.', desc_en: 'Some are hot, some are not.',
        price_cents: 600, allergens: [], options: [],
      },
      {
        name_es: 'Pan con tomate', name_en: 'Bread with tomato',
        desc_es: 'Pan tostado, tomate rallado y aceite de oliva virgen extra.',
        desc_en: 'Toasted bread, grated tomato and extra virgin olive oil.',
        price_cents: 350, allergens: ['gluten'],
        options: [g('extras', 'Extras', 'Extras', false, true, [
          c('ham', 'Jamón ibérico', 'Iberian ham', 300),
          c('anchovy', 'Anchoas', 'Anchovies', 250),
        ])],
      },
    ],
  },
  {
    name_es: 'Platos', name_en: 'Mains', station: 'kitchen',
    items: [
      {
        name_es: 'Tortilla de patatas', name_en: 'Spanish omelette',
        desc_es: 'La de toda la vida.', desc_en: 'Classic potato omelette.',
        price_cents: 700, allergens: ['eggs'],
        options: [
          g('style', 'Punto', 'How cooked', true, false, [
            c('runny', 'Jugosa', 'Runny'),
            c('done', 'Hecha', 'Well done'),
          ]),
          g('onion', 'Cebolla', 'Onion', true, false, [
            c('with', 'Con cebolla', 'With onion'),
            c('without', 'Sin cebolla', 'Without onion'),
          ]),
        ],
      },
      {
        name_es: 'Pulpo a la gallega', name_en: 'Galician-style octopus',
        desc_es: 'Con patata cocida, pimentón y aceite.', desc_en: 'With boiled potato, paprika and olive oil.',
        price_cents: 1650, allergens: ['molluscs'], options: [],
      },
      {
        name_es: 'Gambas al ajillo', name_en: 'Garlic prawns',
        desc_es: 'En cazuela de barro, con guindilla.', desc_en: 'Sizzling in a clay pot with chilli.',
        price_cents: 1200, allergens: ['crustaceans'], options: [],
      },
      {
        name_es: 'Secreto ibérico', name_en: 'Iberian pork secreto',
        desc_es: 'A la brasa, con sal en escamas.', desc_en: 'Chargrilled, with flaky salt.',
        price_cents: 1500, allergens: [],
        options: [g('side', 'Guarnición', 'Side', true, false, [
          c('fries', 'Patatas fritas', 'Fries'),
          c('salad', 'Ensalada', 'Salad'),
          c('padron', 'Pimientos de Padrón', 'Padrón peppers', 150),
        ])],
      },
    ],
  },
  {
    name_es: 'Postres', name_en: 'Desserts', station: 'kitchen',
    items: [
      {
        name_es: 'Tarta de queso', name_en: 'Baked cheesecake',
        desc_es: 'Cremosa por dentro.', desc_en: 'Soft and creamy in the middle.',
        price_cents: 600, allergens: ['milk', 'eggs', 'gluten'], options: [],
      },
      {
        name_es: 'Churros con chocolate', name_en: 'Churros with hot chocolate',
        desc_es: '', desc_en: '',
        price_cents: 550, allergens: ['gluten', 'milk'], options: [],
      },
    ],
  },
  {
    name_es: 'Bebidas', name_en: 'Drinks', station: 'bar',
    items: [
      {
        name_es: 'Cerveza de barril', name_en: 'Draught beer',
        desc_es: '', desc_en: '', price_cents: 250, allergens: ['gluten'],
        options: [g('size', 'Tamaño', 'Size', true, false, [
          c('cana', 'Caña (20 cl)', 'Small (20 cl)'),
          c('doble', 'Doble (40 cl)', 'Large (40 cl)', 150),
        ])],
      },
      {
        name_es: 'Vermut de grifo', name_en: 'House vermouth',
        desc_es: 'Con hielo y naranja.', desc_en: 'With ice and orange.',
        price_cents: 350, allergens: ['sulphites'], options: [],
      },
      {
        name_es: 'Vino tinto (copa)', name_en: 'Red wine (glass)',
        desc_es: '', desc_en: '', price_cents: 380, allergens: ['sulphites'],
        options: [g('wine', 'Vino', 'Wine', true, false, [
          c('rioja', 'Rioja crianza', 'Rioja crianza'),
          c('ribera', 'Ribera del Duero', 'Ribera del Duero', 70),
        ])],
      },
      {
        name_es: 'Tinto de verano', name_en: 'Tinto de verano',
        desc_es: 'Vino tinto con gaseosa.', desc_en: 'Red wine with lemon soda.',
        price_cents: 350, allergens: ['sulphites'], options: [],
      },
      {
        name_es: 'Agua mineral', name_en: 'Mineral water',
        desc_es: '', desc_en: '', price_cents: 200, allergens: [],
        options: [g('type', 'Tipo', 'Type', true, false, [
          c('still', 'Sin gas', 'Still'),
          c('sparkling', 'Con gas', 'Sparkling', 30),
        ])],
      },
      {
        name_es: 'Refresco', name_en: 'Soft drink',
        desc_es: '', desc_en: '', price_cents: 280, allergens: [],
        options: [g('drink', 'Elige', 'Choose', true, false, [
          c('cola', 'Cola', 'Cola'),
          c('cola-zero', 'Cola zero', 'Cola zero'),
          c('orange', 'Naranja', 'Orange'),
          c('lemon', 'Limón', 'Lemon'),
        ])],
      },
    ],
  },
  {
    name_es: 'Cafés', name_en: 'Coffee', station: 'bar',
    items: [
      {
        name_es: 'Café', name_en: 'Coffee',
        desc_es: '', desc_en: '', price_cents: 180, allergens: ['milk'],
        options: [
          g('type', 'Tipo', 'Type', true, false, [
            c('solo', 'Solo', 'Espresso'),
            c('cortado', 'Cortado', 'Cortado'),
            c('leche', 'Con leche', 'White coffee', 30),
          ]),
          g('milk', 'Leche', 'Milk', false, false, [
            c('whole', 'Entera', 'Whole'),
            c('skimmed', 'Desnatada', 'Skimmed'),
            c('oat', 'De avena', 'Oat', 40),
          ]),
        ],
      },
    ],
  },
];

export const SAMPLE_TABLES = [
  'Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6', 'Mesa 7', 'Mesa 8',
  'Terraza 1', 'Terraza 2', 'Terraza 3', 'Terraza 4', 'Barra',
];
