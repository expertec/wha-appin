// schemaGenerator.js - Generador de schemas profesionales con IA

import OpenAIImport from 'openai';
import dayjs from 'dayjs';
const OpenAICtor = OpenAIImport?.OpenAI || OpenAIImport;

// ============ Configuración de OpenAI ============
async function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY');

  try {
    const client = new OpenAICtor({ apiKey: process.env.OPENAI_API_KEY });
    const hasChatCompletions = !!client?.chat?.completions?.create;
    if (hasChatCompletions) return { client, mode: 'v4-chat' };
  } catch {}

  const { Configuration, OpenAIApi } = await import('openai');
  const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
  const client = new OpenAIApi(configuration);
  return { client, mode: 'v3' };
}

function extractText(resp, mode) {
  try {
    if (mode === 'v4-chat') return resp?.choices?.[0]?.message?.content?.trim() || '';
    return resp?.data?.choices?.[0]?.message?.content?.trim() || '';
  } catch {
    return '';
  }
}

async function chatCompletion({ model = 'gpt-4o-mini', messages, temperature = 0.7, max_tokens = 2000 }) {
  const { client, mode } = await getOpenAI();
  if (mode === 'v4-chat') {
    const resp = await client.chat.completions.create({ model, messages, temperature, max_tokens });
    return extractText(resp, mode);
  }
  const resp = await client.createChatCompletion({ model, messages, temperature, max_tokens });
  return extractText(resp, 'v3');
}

// ============ Utilidades (imágenes, colores) ============
function unsplashFallback(keyword, width = 1600, height = 900) {
  return `https://source.unsplash.com/${width}x${height}/?${encodeURIComponent(keyword)}`;
}

function normalizeColors(userColors, defaults) {
  return {
    primary: userColors?.primary || defaults.primary,
    secondary: userColors?.secondary || defaults.secondary,
    accent: userColors?.accent || defaults.accent,
    text: userColors?.text || defaults.text
  };
}

function pickPrimaryColor(data) {
  if (data.primaryColor && /^#(?:[0-9a-f]{3}){1,2}$/i.test(data.primaryColor)) {
    return data.primaryColor;
  }
  const fromPalette = Array.isArray(data.palette) && data.palette[0];
  return fromPalette || '#16a34a';
}

// ============ Asignación de íconos a CATEGORÍAS (server-side) ============
function pickAntIconForCategory(label = '', sectorHint = '') {
  const n = String(label || '').toLowerCase();
  const s = String(sectorHint || '').toLowerCase();

  // Alimenticio (panadería/pastelería/restaurante/café)
  if (/(pastel|tarta|gallet|cupcake|postre|panader)/.test(n) || /(pasteler|panader)/.test(s)) return 'PieChartOutlined';
  if (/(cafe|cafeter|barista|bebida)/.test(n) || /cafeter/.test(s)) return 'CoffeeOutlined';
  if (/(restaurante|comida|pizza|taquer)/.test(n) || /restaurante/.test(s)) return 'RestOutlined';

  // Retail / moda / calzado / accesorios
  if (/(playera|camis|polo|ropa|moda|vestid|jean|boutique)/.test(n) || /(tienda|retail)/.test(s)) return 'ShoppingOutlined';
  if (/(sneaker|tenis|zapat|calzad)/.test(n)) return 'SkinOutlined';
  if (/(accesori|gafa|lente|reloj|bols|joy)/.test(n)) return 'GiftOutlined';

  // Electrónica / tecnología
  if (/(celular|phone|laptop|tablet|pc|electr[oó]nic|gadg)/.test(n) || /tecnolog/.test(s)) return 'MobileOutlined';

  // Servicios / reservas
  if (/(servici|booking|cita|reserva|agenda)/.test(n) || /servicio/.test(s)) return 'ToolOutlined';

  // Hogar / ferretería
  if (/(hogar|mueble|decor|ferreter|herramient)/.test(n)) return 'HomeOutlined';

  // Salud / belleza / fitness
  if (/(spa|belleza|barber|est[eé]tica)/.test(n) || /belleza/.test(s)) return 'HeartOutlined';
  if (/(salud|cl[ií]nica|dent|m[eé]dic)/.test(n) || /cl[ií]nica|salud/.test(s)) return 'MedicineBoxOutlined';
  if (/(gym|fitness|yoga|deport)/.test(n)) return 'HeartOutlined'; // No hay Dumbbell en AntD

  // Mascotas
  if (/(mascota|veterin|pet|perro|gato)/.test(n)) return 'SmileOutlined';

  // Automotriz
  if (/(auto|taller|llanta|mec[aá]nic)/.test(n)) return 'CarOutlined';

  // Educación
  if (/(escuel|curso|academ|clase|capacit)/.test(n)) return 'BookOutlined';

  // Inmobiliario
  if (/(inmobili|bienes ra[ií]ces|casa|depart)/.test(n)) return 'BankOutlined';

  // Fallback neutro
  return 'TagOutlined';
}

/**
 * Inyecta `schema.categoriesDetailed = [{ label, icon }]` y mantiene compatibilidad:
 * - Si ya viene `categoriesDetailed`, solo completa icon si falta.
 * - Si solo viene `categories` (array de strings), lo transforma a detailed.
 * - Si no hay categorías, intenta deducirlas desde `products.items[].category`.
 */
export function withCategoryIcons(schema = {}, { sector = '' } = {}) {
  const s = { ...(schema || {}) };
  const sectorHint = s?.brand?.sector || s?.businessSector || sector || '';

  // 1) Normalizar fuente de categorías a un arreglo de objetos {label, icon?}
  let detailed = [];
  if (Array.isArray(s.categoriesDetailed) && s.categoriesDetailed.length) {
    detailed = s.categoriesDetailed.map((c) =>
      typeof c === 'string' ? ({ label: c, icon: null }) : ({ label: c?.label, icon: c?.icon || null })
    ).filter((c) => c.label);
  } else {
    let labels = Array.isArray(s.categories) ? s.categories.slice() : [];
    if (!labels.length && s.products?.items?.length) {
      const set = new Set();
      for (const it of s.products.items) {
        if (it?.category) set.add(String(it.category));
      }
      labels = [...set];
    }
    detailed = labels.map((label) => ({ label: String(label || '').trim(), icon: null })).filter((c) => c.label);
  }

  // 2) Asignar icon si falta
  detailed = detailed.map(({ label, icon }) => ({
    label,
    icon: icon || pickAntIconForCategory(label, sectorHint),
  }));

  s.categoriesDetailed = detailed;

  // (Opcional) puedes seguir dejando `schema.categories` como array plano
  if (!Array.isArray(s.categories) || !s.categories.length) {
    s.categories = detailed.map((d) => d.label);
  }

  return s;
}

// ============ GENERADORES DE CONTENIDO CON IA ============

/**
 * Genera contenido completo para un sitio usando OpenAI
 */
async function generateSiteContent(data) {
  const { companyInfo, businessStory, businessSector, templateId } = data;

  const prompt = `Eres un experto en marketing y copywriting. Genera contenido profesional y persuasivo para un sitio web.

INFORMACIÓN DEL NEGOCIO:
- Nombre: ${companyInfo}
- Descripción: ${businessStory}
- Sector: ${businessSector || 'general'}
- Tipo de sitio: ${templateId}

GENERA EL SIGUIENTE CONTENIDO EN FORMATO JSON (responde SOLO con el JSON, sin texto adicional):

{
  "hero": {
    "title": "Título principal atractivo (máx 8 palabras)",
    "subtitle": "Subtítulo que explique el valor único (máx 20 palabras)",
    "ctaText": "Texto del botón principal"
  },
  "about": {
    "title": "Sobre Nosotros",
    "text": "Descripción profesional del negocio (2-3 párrafos, 80-120 palabras)",
    "mission": "Misión del negocio (1 frase impactante)"
  },
  "features": [
    {
      "icon": "CheckCircleOutlined",
      "title": "Característica 1",
      "text": "Descripción breve (20-30 palabras)"
    },
    {
      "icon": "RocketOutlined",
      "title": "Característica 2",
      "text": "Descripción breve"
    },
    {
      "icon": "SafetyOutlined",
      "title": "Característica 3",
      "text": "Descripción breve"
    },
    {
      "icon": "StarOutlined",
      "title": "Característica 4",
      "text": "Descripción breve"
    }
  ],
  "benefits": [
    {
      "icon": "BulbOutlined",
      "title": "Beneficio 1",
      "text": "Por qué es valioso"
    },
    {
      "icon": "ThunderboltOutlined",
      "title": "Beneficio 2",
      "text": "Por qué es valioso"
    },
    {
      "icon": "HeartOutlined",
      "title": "Beneficio 3",
      "text": "Por qué es valioso"
    }
  ],
  "testimonials": [
    {
      "text": "Testimonial realista de cliente (40-60 palabras)",
      "author": "Nombre + Ciudad"
    },
    {
      "text": "Otro testimonial realista",
      "author": "Nombre + Ciudad"
    }
  ],
  "faqs": [
    {
      "q": "¿Pregunta frecuente relevante 1?",
      "a": "Respuesta clara y útil (30-50 palabras)"
    },
    {
      "q": "¿Pregunta frecuente relevante 2?",
      "a": "Respuesta clara"
    },
    {
      "q": "¿Pregunta frecuente relevante 3?",
      "a": "Respuesta clara"
    },
    {
      "q": "¿Pregunta frecuente relevante 4?",
      "a": "Respuesta clara"
    }
  ],
  "cta": {
    "title": "Llamado a la acción final (6-10 palabras)",
    "text": "Texto motivador (15-25 palabras)",
    "buttonText": "Texto del botón"
  }
}

IMPORTANTE:
- Todo el contenido debe ser en español mexicano
- Debe sonar profesional pero cercano
- Usa verbos de acción y beneficios claros
- Los testimonials deben parecer reales y específicos
- Las FAQs deben responder dudas comunes del sector`;

  try {
    const response = await chatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 2000
    });

    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const content = JSON.parse(cleanedResponse);
    return content;
  } catch (error) {
    console.error('Error generando contenido con IA:', error);
    return generateFallbackContent(data);
  }
}

/**
 * Genera productos/servicios con IA para ecommerce
 */
async function generateProducts(data, count = 6) {
  const { companyInfo, businessStory } = data;

  const prompt = `Genera ${count} productos o servicios realistas para este negocio.

NEGOCIO: ${companyInfo}
DESCRIPCIÓN: ${businessStory}

Responde SOLO con JSON (sin markdown):

{
  "products": [
    {
      "id": "prod1",
      "title": "Nombre del producto/servicio",
      "description": "Descripción atractiva (30-40 palabras)",
      "price": 299,
      "category": "categoría"
    }
  ],
  "categories": ["Categoría 1", "Categoría 2", "Categoría 3"]
}

NOTA: Los precios deben ser realistas para México (en MXN).`;

  try {
    const response = await chatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 1500
    });

    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    return JSON.parse(cleanedResponse);
  } catch (error) {
    console.error('Error generando productos:', error);
    return {
      products: [
        { id: 'p1', title: 'Producto 1', description: 'Descripción del producto', price: 199, category: 'General' },
        { id: 'p2', title: 'Producto 2', description: 'Descripción del producto', price: 299, category: 'General' },
        { id: 'p3', title: 'Producto 3', description: 'Descripción del producto', price: 399, category: 'General' }
      ],
      categories: ['General', 'Destacados']
    };
  }
}

/**
 * Genera slots de horarios para booking
 */
async function generateBookingSlots(data) {
  const { companyInfo, businessStory } = data;

  const prompt = `Genera 6 slots de horarios realistas para reservas de este negocio.

NEGOCIO: ${companyInfo}
DESCRIPCIÓN: ${businessStory}

Responde SOLO con JSON:

{
  "slots": [
    {
      "id": "slot1",
      "day": "Lunes",
      "time": "09:00",
      "label": "Lunes 09:00 AM",
      "duration": "1 hora",
      "available": true
    }
  ],
  "bookingInfo": {
    "title": "Agenda tu cita",
    "text": "Texto explicativo sobre el proceso de reserva (40-60 palabras)",
    "cancellationPolicy": "Política de cancelación (20-30 palabras)"
  }
}`;

  try {
    const response = await chatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000
    });

    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    return JSON.parse(cleanedResponse);
  } catch (error) {
    console.error('Error generando slots:', error);
    return {
      slots: [
        { id: 's1', day: 'Hoy', time: '16:00', label: 'Hoy 4:00 PM', duration: '1 hora', available: true },
        { id: 's2', day: 'Hoy', time: '18:00', label: 'Hoy 6:00 PM', duration: '1 hora', available: true },
        { id: 's3', day: 'Mañana', time: '11:00', label: 'Mañana 11:00 AM', duration: '1 hora', available: true }
      ],
      bookingInfo: {
        title: 'Agenda tu cita',
        text: 'Selecciona un horario disponible y confirma tu reserva por WhatsApp.',
        cancellationPolicy: 'Puedes cancelar hasta 24 horas antes sin cargo.'
      }
    };
  }
}

// ============ SCHEMA BUILDERS ============
function buildBaseSchema(data, aiContent, templateId = 'info') {
  const brand = data.companyInfo || data.slug || 'Mi Negocio';
  const waDigits = data.contactWhatsapp || data.leadPhone || '';
  const waUrl = waDigits ? `https://wa.me/${waDigits}` : '';

  const heroImg = Array.isArray(data.photoURLs) && data.photoURLs[0]
    ? data.photoURLs[0]
    : unsplashFallback(brand, 1600, 900);

  const gallery = (Array.isArray(data.photoURLs) && data.photoURLs.length > 0)
    ? data.photoURLs
    : [
        unsplashFallback(brand + ' 1', 1200, 800),
        unsplashFallback(brand + ' 2', 1200, 800),
        unsplashFallback(brand + ' 3', 1200, 800)
      ];

  const primary = pickPrimaryColor(data);
  const colors = normalizeColors(
    { primary },
    { primary, secondary: '#0ea5e9', accent: '#f59e0b', text: '#111827' }
  );

  return {
    slug: data.slug,
    brand: {
      name: brand,
      logo: data.logoURL || null,
      // si en otro punto llenas sector, aquí se respeta
      sector: data.businessSector || ''
    },
    businessSector: data.businessSector || '',
    contact: {
      whatsapp: waDigits || '',
      email: data.contactEmail || '',
      facebook: data.socialFacebook || '',
      instagram: data.socialInstagram || ''
    },
    colors,
    hero: {
      title: aiContent?.hero?.title || brand,
      subtitle: aiContent?.hero?.subtitle || data.businessStory || '',
      backgroundImageUrl: heroImg,
      ctaText: aiContent?.hero?.ctaText || 'Contáctanos por WhatsApp',
      ctaUrl: waUrl || '#',
      waText: `Hola ${brand}, vi su página web y me interesa conocer más sobre sus servicios.`
    },
    gallery: {
      title: 'Galería',
      images: gallery
    },
    about: {
      title: aiContent?.about?.title || 'Sobre Nosotros',
      text: aiContent?.about?.text || data.businessStory || 'Somos una empresa comprometida con la excelencia.',
      mission: aiContent?.about?.mission || null
    },
    features: aiContent?.features || [
      { icon: 'CheckCircleOutlined', title: 'Profesional', text: 'Servicio de calidad.' },
      { icon: 'RocketOutlined', title: 'Rápido', text: 'Atención eficiente.' },
      { icon: 'SafetyOutlined', title: 'Confiable', text: 'Tu mejor opción.' }
    ],
    benefits: aiContent?.benefits || [],
    testimonials: {
      title: 'Lo que dicen nuestros clientes',
      items: aiContent?.testimonials || []
    },
    faqs: aiContent?.faqs || [],
    cta: {
      title: aiContent?.cta?.title || '¿Listo para comenzar?',
      text: aiContent?.cta?.text || 'Contáctanos hoy y descubre cómo podemos ayudarte.',
      buttonText: aiContent?.cta?.buttonText || 'Hablar por WhatsApp',
      buttonUrl: waUrl
    },
    menu: [
      { id: 'inicio', label: 'Inicio' },
      { id: 'nosotros', label: 'Nosotros' },
      { id: 'servicios', label: templateId === 'ecommerce' ? 'Productos' : 'Servicios' },
      { id: 'galeria', label: 'Galería' },
      { id: 'contacto', label: 'Contacto' }
    ]
  };
}

function buildInvitationTimeline(eventType = 'general', eventTime = '') {
  const base = dayjs(`1970-01-01 ${eventTime || '17:00'}`);
  const formatSlot = (minutesFromStart, fallback) =>
    base.isValid() ? base.add(minutesFromStart, 'minute').format('hh:mm A') : fallback;

  const templates = {
    wedding: [
      { label: 'Recepción', minutes: 0, detail: 'Recepción y coctel de bienvenida.' },
      { label: 'Ceremonia', minutes: 60, detail: 'Ceremonia principal e intercambio de votos.' },
      { label: 'Brindis y fotos', minutes: 120, detail: 'Brindis con familia y sesión fotográfica.' },
      { label: 'Banquete', minutes: 180, detail: 'Cena y palabras especiales.' },
      { label: 'Fiesta', minutes: 240, detail: 'Primer baile y apertura de pista.' },
    ],
    'baby-shower': [
      { label: 'Bienvenida', minutes: 0, detail: 'Llegada de invitados y fotos.' },
      { label: 'Dinámicas', minutes: 45, detail: 'Juegos y actividades.' },
      { label: 'Mesa de regalos', minutes: 90, detail: 'Apertura de regalos.' },
      { label: 'Brunch', minutes: 120, detail: 'Brunch y despedida.' },
    ],
    birthday: [
      { label: 'Recepción', minutes: 0, detail: 'Coctel de bienvenida.' },
      { label: 'Momento sorpresa', minutes: 60, detail: 'Pastel y velitas.' },
      { label: 'Fiesta', minutes: 120, detail: 'Música y convivencia.' },
    ],
    corporate: [
      { label: 'Registro', minutes: 0, detail: 'Registro y networking.' },
      { label: 'Presentaciones', minutes: 45, detail: 'Conferencias principales.' },
      { label: 'Coffee break', minutes: 105, detail: 'Receso y networking.' },
      { label: 'Cierre', minutes: 150, detail: 'Conclusiones y agradecimientos.' },
    ],
  };

  const defaultTemplate = [
    { label: 'Recepción', minutes: 0, detail: 'Bienvenida y acomodo de invitados.' },
    { label: 'Ceremonia', minutes: 60, detail: 'Momento principal del evento.' },
    { label: 'Celebración', minutes: 120, detail: 'Brindis y convivencia.' },
  ];

  const selected = templates[eventType] || defaultTemplate;
  return selected.map((item) => ({
    label: item.label,
    time: formatSlot(item.minutes, item.label),
    detail: item.detail,
  }));
}

function buildInvitationSchema(data) {
  console.log('[buildInvitationSchema] Generando contenido para invitación...');
  const base = buildBaseSchema(data, generateFallbackContent(data), 'invitation');
  const galleryImages = Array.isArray(data.photoURLs) && data.photoURLs.length
    ? data.photoURLs
    : base.gallery.images;

  const eventDetails = {
    date: data.eventDetails?.date || data.eventDate || null,
    time: data.eventDetails?.time || data.eventTime || null,
    venueName: data.eventDetails?.venueName || data.venueName || '',
    venueAddress: data.eventDetails?.venueAddress || data.venueAddress || '',
    city: data.eventDetails?.city || data.city || '',
    dressCode: data.eventDetails?.dressCode || data.dressCode || '',
  };

  const rsvp = {
    phone: data.rsvp?.phone || data.contactWhatsapp || data.leadPhone || '',
    email: data.rsvp?.email || data.contactEmail || '',
    deadline: data.rsvp?.deadline || data.rsvpDeadline || null,
  };

  const eventType = (data.eventType || 'general').toLowerCase();
  const message =
    data.message ||
    data.businessStory ||
    'Estamos muy emocionados de compartir este momento contigo. Tu presencia hará este día aún más especial.';

  const notes = Array.isArray(data.notes) && data.notes.length
    ? data.notes
    : [
        eventDetails.dressCode ? `Código de vestimenta: ${eventDetails.dressCode}.` : null,
        data.registryLink ? 'Consulta nuestra mesa de regalos para saber cómo apoyarnos.' : null,
        rsvp.deadline
          ? `Por favor confirma antes del ${dayjs(rsvp.deadline).isValid()
              ? dayjs(rsvp.deadline).format('D [de] MMMM YYYY')
              : rsvp.deadline}.`
          : null,
        'Evita llevar arreglos florales grandes dentro del salón.',
      ].filter(Boolean);

  const timeline = buildInvitationTimeline(eventType, eventDetails.time);

  return {
    templateId: 'invitation',
    colors: base.colors,
    contact: base.contact,
    hero: base.hero,
    gallery: { images: galleryImages },
    eventName: data.eventName || data.companyInfo || base.brand?.name || 'Nuestra celebración',
    hosts: data.hosts || '',
    heroImageURL: data.heroImageURL || galleryImages[0],
    message,
    eventType,
    eventDetails,
    rsvp,
    registryLink: data.registryLink || '',
    timeline: { items: timeline },
    notes,
  };
}

/**
 * Schema para sitios informativos (presencia web)
 */
export async function buildInfoSchema(data) {
  console.log('[buildInfoSchema] Generando contenido con IA...');
  const aiContent = await generateSiteContent(data);
  let base = buildBaseSchema(data, aiContent, 'info');

  // Inyectar íconos de categorías si aplica (por si en algún caso agregas categories)
  base = withCategoryIcons(base, { sector: base.businessSector });

  return {
    templateId: 'info',
    ...base,
    services: {
      title: 'Nuestros Servicios',
      items: (aiContent?.features || []).map((f, i) => ({
        icon: f.icon,
        title: f.title,
        text: f.text,
        imageURL: base.gallery.images[i % base.gallery.images.length]
      }))
    }
  };
}

/**
 * Schema para ecommerce
 */
export async function buildEcommerceSchema(data) {
  console.log('[buildEcommerceSchema] Generando contenido con IA...');
  const [aiContent, productsData] = await Promise.all([
    generateSiteContent(data),
    generateProducts(data, 6)
  ]);

  let base = buildBaseSchema(data, aiContent, 'ecommerce');
  const waUrl = base.hero.ctaUrl;

  // Mapear productos con imágenes de la galería
  const products = (productsData.products || []).map((p, i) => ({
    ...p,
    image: base.gallery.images[i % base.gallery.images.length],
    buttonUrl: waUrl ? `${waUrl}?text=${encodeURIComponent(`Hola, me interesa ${p.title}`)}` : '#',
    buttonText: 'Ordenar por WhatsApp'
  }));

  // Construcción inicial del schema ecommerce
  let schema = {
    templateId: 'ecommerce',
    ...base,
    categories: productsData.categories || ['Todos', 'Destacados'],
    products: {
      title: 'Nuestros Productos',
      items: products
    },
    shipping: {
      text: 'Envíos a toda la República Mexicana. Tiempo estimado: 3-5 días hábiles.'
    },
    payments: {
      text: 'Aceptamos transferencia, tarjeta de crédito/débito y pago contra entrega (según zona).'
    },
    promo: (aiContent.faqs && aiContent.faqs.length > 2) ? {
      title: '¡Oferta Especial!',
      text: 'Pregunta por nuestras promociones vigentes.',
      cta: 'Conocer promociones',
      waText: 'Hola, quiero saber sobre las promociones disponibles.'
    } : null
  };

  // 👉 Inyectar categorías con iconos (categoriesDetailed)
  schema = withCategoryIcons(schema, { sector: schema.businessSector });

  return schema;
}

/**
 * Schema para reservas/booking
 */
export async function buildBookingSchema(data) {
  console.log('[buildBookingSchema] Generando contenido con IA...');
  const [aiContent, bookingData] = await Promise.all([
    generateSiteContent(data),
    generateBookingSlots(data)
  ]);

  let base = buildBaseSchema(data, aiContent, 'booking');
  const waUrl = base.hero.ctaUrl;

  const slots = (bookingData.slots || []).map(s => ({
    ...s,
    buttonUrl: waUrl ? `${waUrl}?text=${encodeURIComponent(`Hola, quiero reservar: ${s.label}`)}` : '#',
    buttonText: 'Reservar por WhatsApp'
  }));

  let schema = {
    templateId: 'booking',
    ...base,
    booking: {
      title: bookingData.bookingInfo?.title || 'Agenda tu cita',
      text: bookingData.bookingInfo?.text || 'Selecciona un horario y confirma tu reserva.',
      cancellationPolicy: bookingData.bookingInfo?.cancellationPolicy || null,
      slots
    },
    services: {
      title: 'Servicios Disponibles',
      items: (aiContent?.features || []).slice(0, 4).map((f, i) => ({
        icon: f.icon,
        title: f.title,
        text: f.text,
        imageURL: base.gallery.images[i % base.gallery.images.length]
      }))
    }
  };

  // 👉 Por si tu booking maneja categorías (algunos negocios lo usan)
  schema = withCategoryIcons(schema, { sector: schema.businessSector });

  return schema;
}

/**
 * Función principal que decide qué schema generar
 */
export async function generateCompleteSchema(data) {
  const templateId = (data.templateId || 'info').toLowerCase();

  console.log(`[generateCompleteSchema] Generando schema para templateId: ${templateId}`);

  try {
    switch (templateId) {
      case 'ecommerce':
        return await buildEcommerceSchema(data);
      case 'booking':
        return await buildBookingSchema(data);
      case 'invitation':
        return await buildInvitationSchema(data);
      case 'info':
      default:
        return await buildInfoSchema(data);
    }
  } catch (error) {
    console.error('[generateCompleteSchema] Error:', error);
    const base = buildBaseSchema(data, generateFallbackContent(data), templateId);
    let fallbackSchema = { templateId: 'info', ...base };
    // Aun en fallback, añade categoriesDetailed si aplica
    fallbackSchema = withCategoryIcons(fallbackSchema, { sector: fallbackSchema.businessSector });
    return fallbackSchema;
  }
}

/**
 * Contenido de fallback si falla la IA
 */
function generateFallbackContent(data) {
  return {
    hero: {
      title: data.companyInfo || 'Tu Negocio',
      subtitle: data.businessStory || 'Soluciones profesionales para ti',
      ctaText: 'Contáctanos'
    },
    about: {
      title: 'Sobre Nosotros',
      text: data.businessStory || 'Somos una empresa comprometida con brindar servicios de calidad.',
      mission: 'Tu satisfacción es nuestra prioridad.'
    },
    features: [
      { icon: 'CheckCircleOutlined', title: 'Calidad', text: 'Servicio profesional garantizado.' },
      { icon: 'RocketOutlined', title: 'Rapidez', text: 'Atención ágil y eficiente.' },
      { icon: 'SafetyOutlined', title: 'Confianza', text: 'Respaldo y seguridad.' },
      { icon: 'StarOutlined', title: 'Experiencia', text: 'Años de trayectoria.' }
    ],
    benefits: [
      { icon: 'BulbOutlined', title: 'Innovación', text: 'Soluciones modernas.' },
      { icon: 'HeartOutlined', title: 'Atención', text: 'Trato personalizado.' },
      { icon: 'ThunderboltOutlined', title: 'Eficiencia', text: 'Resultados rápidos.' }
    ],
    testimonials: [
      { text: 'Excelente servicio, muy recomendado. La atención fue profesional y los resultados superaron mis expectativas.', author: 'Cliente Satisfecho' },
      { text: 'Muy profesionales y atentos. Definitivamente volveré a contratar sus servicios.', author: 'Usuario Feliz' }
    ],
    faqs: [
      { q: '¿Cómo puedo contactarlos?', a: 'Puedes escribirnos por WhatsApp o enviarnos un correo electrónico. Respondemos en menos de 24 horas.' },
      { q: '¿Cuál es el horario de atención?', a: 'Atendemos de lunes a viernes de 9:00 AM a 6:00 PM.' },
      { q: '¿Hacen envíos?', a: 'Sí, realizamos envíos a toda la República Mexicana.' },
      { q: '¿Cuáles son las formas de pago?', a: 'Aceptamos transferencia bancaria, tarjeta de crédito y débito.' }
    ],
    cta: {
      title: '¿Listo para comenzar?',
      text: 'Contáctanos hoy mismo y descubre cómo podemos ayudarte.',
      buttonText: 'Hablar por WhatsApp'
    }
  };
}
