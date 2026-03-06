import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

function paise(rupees: number) { return rupees * 100; }

async function main() {
  console.log('🌱 Seeding start...\n');

  // ─── STATES ──────────────────────────────────────────────────

  console.log('📍 States...');
  const states = await Promise.all([
    db.state.upsert({ where: { code: 'UP' }, update: {}, create: { nameHi: 'उत्तर प्रदेश', nameEn: 'Uttar Pradesh', code: 'UP', sortOrder: 1 } }),
    db.state.upsert({ where: { code: 'MH' }, update: {}, create: { nameHi: 'महाराष्ट्र',   nameEn: 'Maharashtra',   code: 'MH', sortOrder: 2 } }),
    db.state.upsert({ where: { code: 'DL' }, update: {}, create: { nameHi: 'दिल्ली',       nameEn: 'Delhi',         code: 'DL', sortOrder: 3 } }),
    db.state.upsert({ where: { code: 'KA' }, update: {}, create: { nameHi: 'कर्नाटक',      nameEn: 'Karnataka',     code: 'KA', sortOrder: 4 } }),
    db.state.upsert({ where: { code: 'RJ' }, update: {}, create: { nameHi: 'राजस्थान',     nameEn: 'Rajasthan',     code: 'RJ', sortOrder: 5 } }),
    db.state.upsert({ where: { code: 'GJ' }, update: {}, create: { nameHi: 'गुजरात',       nameEn: 'Gujarat',       code: 'GJ', sortOrder: 6 } }),
    db.state.upsert({ where: { code: 'MP' }, update: {}, create: { nameHi: 'मध्य प्रदेश', nameEn: 'Madhya Pradesh',code: 'MP', sortOrder: 7 } }),
  ]);
  const stateMap: Record<string, string> = {};
  for (const s of states) stateMap[s.code] = s.id;
  console.log(`   ✅ ${states.length} states`);

  // ─── CITIES ──────────────────────────────────────────────────

  console.log('🏙️  Cities...');
  const citiesData = [
    { sc: 'UP', nameHi: 'लखनऊ',      nameEn: 'Lucknow',   slug: 'lucknow',   tier: 'T2', lat: 26.8467, lng: 80.9462 },
    { sc: 'UP', nameHi: 'कानपुर',     nameEn: 'Kanpur',    slug: 'kanpur',    tier: 'T2', lat: 26.4499, lng: 80.3319 },
    { sc: 'UP', nameHi: 'आगरा',       nameEn: 'Agra',      slug: 'agra',      tier: 'T2', lat: 27.1767, lng: 78.0081 },
    { sc: 'UP', nameHi: 'वाराणसी',   nameEn: 'Varanasi',  slug: 'varanasi',  tier: 'T2', lat: 25.3176, lng: 82.9739 },
    { sc: 'UP', nameHi: 'प्रयागराज', nameEn: 'Prayagraj', slug: 'prayagraj', tier: 'T2', lat: 25.4358, lng: 81.8463 },
    { sc: 'UP', nameHi: 'गोरखपुर',   nameEn: 'Gorakhpur', slug: 'gorakhpur', tier: 'T3', lat: 26.7606, lng: 83.3732 },
    { sc: 'UP', nameHi: 'मेरठ',       nameEn: 'Meerut',    slug: 'meerut',    tier: 'T2', lat: 28.9845, lng: 77.7064 },
    { sc: 'UP', nameHi: 'नोएडा',      nameEn: 'Noida',     slug: 'noida',     tier: 'T1', lat: 28.5355, lng: 77.3910 },
    { sc: 'MH', nameHi: 'मुंबई',     nameEn: 'Mumbai',    slug: 'mumbai',    tier: 'T1', lat: 19.0760, lng: 72.8777 },
    { sc: 'MH', nameHi: 'पुणे',      nameEn: 'Pune',      slug: 'pune',      tier: 'T1', lat: 18.5204, lng: 73.8567 },
    { sc: 'MH', nameHi: 'नागपुर',    nameEn: 'Nagpur',    slug: 'nagpur',    tier: 'T2', lat: 21.1458, lng: 79.0882 },
    { sc: 'MH', nameHi: 'नासिक',     nameEn: 'Nashik',    slug: 'nashik',    tier: 'T2', lat: 19.9975, lng: 73.7898 },
    { sc: 'DL', nameHi: 'नई दिल्ली', nameEn: 'New Delhi', slug: 'new-delhi', tier: 'T1', lat: 28.6139, lng: 77.2090 },
    { sc: 'KA', nameHi: 'बेंगलुरु',  nameEn: 'Bengaluru', slug: 'bengaluru', tier: 'T1', lat: 12.9716, lng: 77.5946 },
    { sc: 'KA', nameHi: 'मैसूर',     nameEn: 'Mysuru',    slug: 'mysuru',    tier: 'T2', lat: 12.2958, lng: 76.6394 },
    { sc: 'RJ', nameHi: 'जयपुर',     nameEn: 'Jaipur',    slug: 'jaipur',    tier: 'T1', lat: 26.9124, lng: 75.7873 },
    { sc: 'RJ', nameHi: 'जोधपुर',   nameEn: 'Jodhpur',   slug: 'jodhpur',   tier: 'T2', lat: 26.2389, lng: 73.0243 },
    { sc: 'RJ', nameHi: 'उदयपुर',   nameEn: 'Udaipur',   slug: 'udaipur',   tier: 'T2', lat: 24.5854, lng: 73.7125 },
    { sc: 'GJ', nameHi: 'अहमदाबाद', nameEn: 'Ahmedabad', slug: 'ahmedabad', tier: 'T1', lat: 23.0225, lng: 72.5714 },
    { sc: 'GJ', nameHi: 'सूरत',      nameEn: 'Surat',     slug: 'surat',     tier: 'T1', lat: 21.1702, lng: 72.8311 },
    { sc: 'MP', nameHi: 'इंदौर',     nameEn: 'Indore',    slug: 'indore',    tier: 'T2', lat: 22.7196, lng: 75.8577 },
    { sc: 'MP', nameHi: 'भोपाल',     nameEn: 'Bhopal',    slug: 'bhopal',    tier: 'T2', lat: 23.2599, lng: 77.4126 },
  ];
  const cityMap: Record<string, string> = {};
  for (const c of citiesData) {
    const city = await db.city.upsert({
      where: { slug: c.slug }, update: {},
      create: {
        stateId: stateMap[c.sc], nameHi: c.nameHi, nameEn: c.nameEn,
        slug: c.slug, tier: c.tier, lat: c.lat, lng: c.lng,
        isActive: true, launchDate: new Date(),
        surgeConfig: { maxMultiplier: 2.0, thresholds: [{ demandRatio: 1.5, multiplier: 1.2 }, { demandRatio: 2.0, multiplier: 1.5 }] },
      },
    });
    cityMap[c.slug] = city.id;
  }
  console.log(`   ✅ ${citiesData.length} cities`);

  // ─── AREAS (Lucknow) ─────────────────────────────────────────

  console.log('📌 Areas (Lucknow)...');
  const lucknowAreas = [
    { nameHi: 'हजरतगंज',     nameEn: 'Hazratganj',   slug: 'hazratganj',   pincodes: ['226001'],           lat: 26.8537, lng: 80.9454 },
    { nameHi: 'गोमती नगर',   nameEn: 'Gomti Nagar',  slug: 'gomti-nagar',  pincodes: ['226010','226016'],  lat: 26.8562, lng: 81.0004 },
    { nameHi: 'अलीगंज',      nameEn: 'Aliganj',      slug: 'aliganj',      pincodes: ['226024'],           lat: 26.8919, lng: 80.9683 },
    { nameHi: 'इंदिरा नगर', nameEn: 'Indira Nagar', slug: 'indira-nagar', pincodes: ['226016','226020'],  lat: 26.8813, lng: 81.0136 },
    { nameHi: 'महानगर',      nameEn: 'Mahanagar',    slug: 'mahanagar',    pincodes: ['226006'],           lat: 26.8667, lng: 80.9667 },
    { nameHi: 'राजाजीपुरम', nameEn: 'Rajajipuram',  slug: 'rajajipuram',  pincodes: ['226017'],           lat: 26.8289, lng: 80.9061 },
    { nameHi: 'विभव खंड',   nameEn: 'Vibhav Khand', slug: 'vibhav-khand', pincodes: ['226010'],           lat: 26.8600, lng: 80.9900 },
    { nameHi: 'कानपुर रोड', nameEn: 'Kanpur Road',  slug: 'kanpur-road',  pincodes: ['226012','226023'],  lat: 26.8201, lng: 80.9136 },
    { nameHi: 'चिनहट',      nameEn: 'Chinhat',       slug: 'chinhat',      pincodes: ['226028'],           lat: 26.8748, lng: 81.0498 },
    { nameHi: 'सआदतगंज',    nameEn: 'Saadatganj',   slug: 'saadatganj',   pincodes: ['226003'],           lat: 26.8365, lng: 80.9198 },
  ];
  for (const a of lucknowAreas) {
    await db.area.upsert({
      where: { cityId_slug: { cityId: cityMap['lucknow'], slug: a.slug } }, update: {},
      create: { cityId: cityMap['lucknow'], nameHi: a.nameHi, nameEn: a.nameEn, slug: a.slug, pincodes: a.pincodes, lat: a.lat, lng: a.lng, radiusKm: 4.0, isActive: true, operationMode: 'GIG_ONLY' },
    });
  }
  console.log(`   ✅ ${lucknowAreas.length} areas (Lucknow)`);

  // ─── SERVICE CATEGORIES ──────────────────────────────────────

  console.log('📦 Service Categories...');
  const catData = [
    { nameHi: 'होम क्लीनिंग',      nameEn: 'Home Cleaning',    slug: 'home-cleaning',    sort: 1  },
    { nameHi: 'AC सर्विस',         nameEn: 'AC Repair',        slug: 'ac-repair',        sort: 2  },
    { nameHi: 'इलेक्ट्रीशियन',    nameEn: 'Electrician',      slug: 'electrician',      sort: 3  },
    { nameHi: 'प्लंबर',            nameEn: 'Plumber',          slug: 'plumber',          sort: 4  },
    { nameHi: 'कारपेंटर',          nameEn: 'Carpenter',        slug: 'carpenter',        sort: 5  },
    { nameHi: 'पेंटर',             nameEn: 'Painter',          slug: 'painter',          sort: 6  },
    { nameHi: 'पेस्ट कंट्रोल',   nameEn: 'Pest Control',     slug: 'pest-control',     sort: 7  },
    { nameHi: 'अप्लायंस रिपेयर', nameEn: 'Appliance Repair', slug: 'appliance-repair', sort: 8  },
    { nameHi: 'ब्यूटी',            nameEn: 'Beauty',           slug: 'beauty',           sort: 9  },
    { nameHi: 'पैकर्स मूवर्स',   nameEn: 'Packers Movers',   slug: 'shifting',         sort: 10 },
  ];
  const catMap: Record<string, string> = {};
  for (const c of catData) {
    const cat = await db.serviceCategory.upsert({ where: { slug: c.slug }, update: {}, create: { nameHi: c.nameHi, nameEn: c.nameEn, slug: c.slug, sortOrder: c.sort, isActive: true } });
    catMap[c.slug] = cat.id;
  }
  console.log(`   ✅ ${catData.length} categories`);

  // ─── SERVICES ────────────────────────────────────────────────

  console.log('🔧 Services...');
  const servicesData = [
    { cat: 'home-cleaning',    nameHi: 'बाथरूम क्लीनिंग',    nameEn: 'Bathroom Cleaning',       slug: 'bathroom-cleaning',      estMins: 60,  sort: 1 },
    { cat: 'home-cleaning',    nameHi: 'किचन क्लीनिंग',      nameEn: 'Kitchen Cleaning',         slug: 'kitchen-cleaning',       estMins: 90,  sort: 2 },
    { cat: 'home-cleaning',    nameHi: 'फुल होम क्लीनिंग',   nameEn: 'Full Home Cleaning',       slug: 'full-home-cleaning',     estMins: 180, sort: 3 },
    { cat: 'home-cleaning',    nameHi: 'सोफा क्लीनिंग',      nameEn: 'Sofa Cleaning',            slug: 'sofa-cleaning',          estMins: 120, sort: 4 },
    { cat: 'home-cleaning',    nameHi: 'कारपेट क्लीनिंग',    nameEn: 'Carpet Cleaning',          slug: 'carpet-cleaning',        estMins: 90,  sort: 5 },
    { cat: 'ac-repair',        nameHi: 'AC सर्विसिंग',        nameEn: 'AC Servicing',             slug: 'ac-servicing',           estMins: 60,  sort: 1 },
    { cat: 'ac-repair',        nameHi: 'AC इंस्टॉलेशन',      nameEn: 'AC Installation',          slug: 'ac-installation',        estMins: 120, sort: 2 },
    { cat: 'ac-repair',        nameHi: 'AC गैस रिफिलिंग',    nameEn: 'AC Gas Refilling',         slug: 'ac-gas-refilling',       estMins: 90,  sort: 3 },
    { cat: 'ac-repair',        nameHi: 'AC रिपेयर',           nameEn: 'AC Repair',                slug: 'ac-repair-general',      estMins: 120, sort: 4 },
    { cat: 'electrician',      nameHi: 'स्विच/सॉकेट रिपेयर', nameEn: 'Switch Socket Repair',    slug: 'switch-socket-repair',   estMins: 30,  sort: 1 },
    { cat: 'electrician',      nameHi: 'फैन रिपेयर',          nameEn: 'Fan Repair',               slug: 'fan-repair',             estMins: 45,  sort: 2 },
    { cat: 'electrician',      nameHi: 'वायरिंग',             nameEn: 'Wiring',                   slug: 'wiring',                 estMins: 120, sort: 3 },
    { cat: 'electrician',      nameHi: 'MCB बदलें',           nameEn: 'MCB Replacement',          slug: 'mcb-replacement',        estMins: 30,  sort: 4 },
    { cat: 'electrician',      nameHi: 'लाइट फिटिंग',        nameEn: 'Light Fitting',            slug: 'light-fitting',          estMins: 45,  sort: 5 },
    { cat: 'plumber',          nameHi: 'नल रिपेयर',           nameEn: 'Tap Repair',               slug: 'tap-repair',             estMins: 30,  sort: 1 },
    { cat: 'plumber',          nameHi: 'पाइप लीकेज',          nameEn: 'Pipe Leakage',             slug: 'pipe-leakage',           estMins: 60,  sort: 2 },
    { cat: 'plumber',          nameHi: 'बाथरूम फिटिंग',      nameEn: 'Bathroom Fitting',         slug: 'bathroom-fitting',       estMins: 120, sort: 3 },
    { cat: 'plumber',          nameHi: 'वाटर टैंक क्लीनिंग', nameEn: 'Water Tank Cleaning',      slug: 'water-tank-cleaning',    estMins: 90,  sort: 4 },
    { cat: 'plumber',          nameHi: 'मोटर पंप रिपेयर',    nameEn: 'Motor Pump Repair',        slug: 'motor-pump-repair',      estMins: 90,  sort: 5 },
    { cat: 'carpenter',        nameHi: 'फर्नीचर रिपेयर',     nameEn: 'Furniture Repair',         slug: 'furniture-repair',       estMins: 90,  sort: 1 },
    { cat: 'carpenter',        nameHi: 'दरवाजा रिपेयर',      nameEn: 'Door Repair',              slug: 'door-repair',            estMins: 60,  sort: 2 },
    { cat: 'carpenter',        nameHi: 'खिड़की रिपेयर',      nameEn: 'Window Repair',            slug: 'window-repair',          estMins: 60,  sort: 3 },
    { cat: 'carpenter',        nameHi: 'कबाट बनाना',          nameEn: 'Wardrobe Making',          slug: 'wardrobe-making',        estMins: 240, sort: 4 },
    { cat: 'painter',          nameHi: 'रूम पेंटिंग',         nameEn: 'Room Painting',            slug: 'room-painting',          estMins: 300, sort: 1 },
    { cat: 'painter',          nameHi: 'पूरे घर की पेंटिंग', nameEn: 'Full House Painting',      slug: 'full-house-painting',    estMins: 720, sort: 2 },
    { cat: 'painter',          nameHi: 'वॉटरप्रूफिंग',       nameEn: 'Waterproofing',            slug: 'waterproofing',          estMins: 180, sort: 3 },
    { cat: 'pest-control',     nameHi: 'कॉकरोच ट्रीटमेंट',  nameEn: 'Cockroach Treatment',      slug: 'cockroach-treatment',    estMins: 60,  sort: 1 },
    { cat: 'pest-control',     nameHi: 'बेड बग ट्रीटमेंट',  nameEn: 'Bed Bug Treatment',        slug: 'bed-bug-treatment',      estMins: 90,  sort: 2 },
    { cat: 'pest-control',     nameHi: 'जनरल पेस्ट कंट्रोल', nameEn: 'General Pest Control',    slug: 'general-pest-control',   estMins: 120, sort: 3 },
    { cat: 'pest-control',     nameHi: 'दीमक ट्रीटमेंट',    nameEn: 'Termite Treatment',        slug: 'termite-treatment',      estMins: 180, sort: 4 },
    { cat: 'appliance-repair', nameHi: 'वाशिंग मशीन रिपेयर', nameEn: 'Washing Machine Repair',  slug: 'washing-machine-repair', estMins: 90,  sort: 1 },
    { cat: 'appliance-repair', nameHi: 'फ्रिज रिपेयर',        nameEn: 'Refrigerator Repair',     slug: 'refrigerator-repair',    estMins: 90,  sort: 2 },
    { cat: 'appliance-repair', nameHi: 'माइक्रोवेव रिपेयर',  nameEn: 'Microwave Repair',        slug: 'microwave-repair',       estMins: 60,  sort: 3 },
    { cat: 'appliance-repair', nameHi: 'RO वाटर प्यूरीफायर', nameEn: 'RO Water Purifier',       slug: 'ro-water-purifier',      estMins: 60,  sort: 4 },
    { cat: 'beauty',           nameHi: 'महिला हेयरकट',        nameEn: 'Women Haircut',            slug: 'women-haircut',          estMins: 60,  sort: 1 },
    { cat: 'beauty',           nameHi: 'फेशियल',              nameEn: 'Facial',                   slug: 'facial',                 estMins: 60,  sort: 2 },
    { cat: 'beauty',           nameHi: 'वैक्सिंग',            nameEn: 'Waxing',                  slug: 'waxing',                 estMins: 60,  sort: 3 },
    { cat: 'beauty',           nameHi: 'मेहँदी',              nameEn: 'Mehendi',                  slug: 'mehendi',                estMins: 120, sort: 4 },
    { cat: 'beauty',           nameHi: 'ब्राइडल मेकअप',      nameEn: 'Bridal Makeup',            slug: 'bridal-makeup',          estMins: 180, sort: 5 },
  ];
  const serviceMap: Record<string, string> = {};
  for (const s of servicesData) {
    const svc = await db.service.upsert({
      where: { slug: s.slug }, update: {},
      create: { categoryId: catMap[s.cat], nameHi: s.nameHi, nameEn: s.nameEn, slug: s.slug, sortOrder: s.sort, isActive: true, estimatedDurationMin: s.estMins, searchKeywords: [s.nameEn.toLowerCase()] },
    });
    serviceMap[s.slug] = svc.id;
  }
  console.log(`   ✅ ${servicesData.length} services`);

  // ─── SERVICE PRICING (Lucknow) ───────────────────────────────

  console.log('💰 Service Pricing (Lucknow)...');
  // [BASIC, SILVER, GOLD] in rupees
  const pm: Record<string, [number, number, number]> = {
    'bathroom-cleaning':     [199,  249,  349],  'kitchen-cleaning':    [249,  299,  399],
    'full-home-cleaning':    [599,  749,  999],  'sofa-cleaning':       [299,  399,  499],
    'carpet-cleaning':       [249,  349,  449],  'ac-servicing':        [399,  499,  599],
    'ac-installation':       [599,  699,  799],  'ac-gas-refilling':    [899, 1099, 1299],
    'ac-repair-general':     [499,  649,  799],  'switch-socket-repair':[149,  199,  249],
    'fan-repair':            [199,  249,  299],  'wiring':              [499,  649,  799],
    'mcb-replacement':       [149,  199,  249],  'light-fitting':       [149,  199,  249],
    'tap-repair':            [149,  199,  249],  'pipe-leakage':        [299,  399,  499],
    'bathroom-fitting':      [499,  649,  799],  'water-tank-cleaning': [499,  649,  799],
    'motor-pump-repair':     [399,  499,  599],  'furniture-repair':    [299,  399,  499],
    'door-repair':           [249,  349,  449],  'window-repair':       [199,  299,  399],
    'wardrobe-making':       [999, 1299, 1599],  'room-painting':       [999, 1299, 1599],
    'full-house-painting':   [4999,6499, 7999],  'waterproofing':      [1499, 1999, 2499],
    'cockroach-treatment':   [399,  499,  599],  'bed-bug-treatment':   [599,  749,  899],
    'general-pest-control':  [499,  649,  799],  'termite-treatment':   [999, 1299, 1599],
    'washing-machine-repair':[399,  499,  599],  'refrigerator-repair': [499,  649,  799],
    'microwave-repair':      [299,  399,  499],  'ro-water-purifier':   [299,  399,  499],
    'women-haircut':         [299,  399,  499],  'facial':              [399,  499,  599],
    'waxing':                [249,  349,  449],  'mehendi':             [499,  649,  799],
    'bridal-makeup':         [1999,2499, 2999],
  };
  const tiers = ['BASIC', 'SILVER', 'GOLD'] as const;
  let pricingCount = 0;
  for (const [slug, prices] of Object.entries(pm)) {
    const serviceId = serviceMap[slug];
    if (!serviceId) continue;
    for (let i = 0; i < tiers.length; i++) {
      await db.servicePricing.upsert({
        where: { serviceId_cityId_workerTier: { serviceId, cityId: cityMap['lucknow'], workerTier: tiers[i] } },
        update: {},
        create: { serviceId, cityId: cityMap['lucknow'], workerTier: tiers[i], basePrice: paise(prices[i]), platformFeePercent: 14.0, isActive: true },
      });
      pricingCount++;
    }
  }
  console.log(`   ✅ ${pricingCount} pricing records`);

  // ─── STAFF ACCOUNTS ──────────────────────────────────────────

  console.log('👥 Staff Accounts...');
  const defaultPassword = 'Admin@1234';
  const passwordHash    = await bcrypt.hash(defaultPassword, 12);
  const staffData = [
    { name: 'Super Admin',       email: 'admin@inistnt.com',     role: 'SUPER_ADMIN',       citySlug: null       },
    { name: 'Tech Admin',        email: 'tech@inistnt.com',      role: 'TECH_ADMIN',        citySlug: null       },
    { name: 'Finance Admin',     email: 'finance@inistnt.com',   role: 'FINANCE_ADMIN',     citySlug: null       },
    { name: 'Lucknow Manager',   email: 'lko@inistnt.com',       role: 'CITY_MANAGER',      citySlug: 'lucknow'  },
    { name: 'Support Agent 1',   email: 'support1@inistnt.com',  role: 'SUPPORT_AGENT',     citySlug: 'lucknow'  },
    { name: 'Support Agent 2',   email: 'support2@inistnt.com',  role: 'SUPPORT_AGENT',     citySlug: 'lucknow'  },
    { name: 'Field Supervisor',  email: 'field@inistnt.com',     role: 'FIELD_SUPERVISOR',  citySlug: 'lucknow'  },
    { name: 'Marketing Manager', email: 'marketing@inistnt.com', role: 'MARKETING_MANAGER', citySlug: null       },
    { name: 'QA Analyst',        email: 'qa@inistnt.com',        role: 'QA_ANALYST',        citySlug: null       },
  ];
  for (const s of staffData) {
    await db.staff.upsert({
      where: { email: s.email }, update: {},
      create: { name: s.name, email: s.email, role: s.role as any, passwordHash, isActive: true, cityId: s.citySlug ? cityMap[s.citySlug] : undefined },
    });
  }
  console.log(`   ✅ ${staffData.length} staff accounts`);

  // ─── COMMISSION RULES ────────────────────────────────────────

  console.log('📊 Commission Rules...');
  const adminStaff = await db.staff.findFirst({ where: { role: 'SUPER_ADMIN' } });
  const systemId   = adminStaff!.id;
  await db.commissionRule.upsert({
    where: { id: 'national-default' }, update: {},
    create: { id: 'national-default', level: 'NATIONAL', value: 12.0, isActive: true, setById: systemId, reason: 'Default national commission' },
  });
  await db.commissionRule.upsert({
    where: { id: 'lucknow-launch' }, update: {},
    create: { id: 'lucknow-launch', level: 'CITY', cityId: cityMap['lucknow'], value: 10.0, isActive: true, setById: systemId, reason: 'Launch city reduced commission' },
  });
  console.log('   ✅ 2 commission rules');

  // ─── FEATURE FLAGS ───────────────────────────────────────────

  console.log('🚩 Feature Flags...');
  const flags = [
    { key: 'surge_pricing',        description: 'Enable surge pricing',         isEnabled: true  },
    { key: 'loyalty_points',       description: 'Enable loyalty points system', isEnabled: true  },
    { key: 'referral_program',     description: 'Enable referral program',      isEnabled: true  },
    { key: 'worker_subscriptions', description: 'Enable worker subscriptions',  isEnabled: false },
    { key: 'scheduled_bookings',   description: 'Enable scheduled bookings',    isEnabled: true  },
    { key: 'cash_on_delivery',     description: 'Enable cash payment option',   isEnabled: false },
    { key: 'sos_feature',          description: 'Enable SOS emergency feature', isEnabled: true  },
    { key: 'in_app_chat',          description: 'Enable in-app chat',           isEnabled: false },
    { key: 'auto_assign_worker',   description: 'Auto assign nearest worker',   isEnabled: true  },
    { key: 'review_mandatory',     description: 'Force review after booking',   isEnabled: false },
  ];
  for (const flag of flags) {
    await db.featureFlag.upsert({ where: { key: flag.key }, update: {}, create: flag });
  }
  console.log(`   ✅ ${flags.length} feature flags`);

  // ─── APP VERSIONS ────────────────────────────────────────────

  console.log('📱 App Versions...');
  await db.appVersion.upsert({
    where: { platform: 'android' }, update: {},
    create: { platform: 'android', currentVersion: '1.0.0', minVersion: '1.0.0', forceUpdate: false, updateMessage: 'Initial launch', storeUrl: 'https://play.google.com/store/apps/details?id=com.inistnt.app', isActive: true },
  });
  await db.appVersion.upsert({
    where: { platform: 'ios' }, update: {},
    create: { platform: 'ios', currentVersion: '1.0.0', minVersion: '1.0.0', forceUpdate: false, updateMessage: 'Initial launch', storeUrl: 'https://apps.apple.com/app/inistnt/id000000000', isActive: true },
  });
  console.log('   ✅ 2 app versions');

  // ─── COUPONS ─────────────────────────────────────────────────

  console.log('🎟️  Coupons...');
  await db.coupon.upsert({
    where: { code: 'WELCOME50' }, update: {},
    create: { code: 'WELCOME50', title: 'Welcome Offer - 50% Off', discountType: 'percentage', discountValue: 50, maxDiscount: paise(150), minOrderAmount: paise(199), validFrom: new Date(), validTo: new Date(Date.now() + 365*24*60*60*1000), maxUsageTotal: 10000, maxUsagePerUser: 1, isActive: true },
  });
  await db.coupon.upsert({
    where: { code: 'FLAT100' }, update: {},
    create: { code: 'FLAT100', title: 'Flat ₹100 Off', discountType: 'flat', discountValue: paise(100), minOrderAmount: paise(399), validFrom: new Date(), validTo: new Date(Date.now() + 90*24*60*60*1000), maxUsageTotal: 5000, maxUsagePerUser: 3, isActive: true },
  });
  await db.coupon.upsert({
    where: { code: 'FIRST200' }, update: {},
    create: { code: 'FIRST200', title: 'First Booking ₹200 Off', discountType: 'flat', discountValue: paise(200), minOrderAmount: paise(499), validFrom: new Date(), validTo: new Date(Date.now() + 180*24*60*60*1000), maxUsageTotal: 10000, maxUsagePerUser: 1, isActive: true },
  });
  console.log('   ✅ 3 coupons');

  // ─── SUMMARY ─────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(50));
  console.log('✅ SEED COMPLETE!');
  console.log('═'.repeat(50));
  console.log(`
  States:       ${states.length}
  Cities:       ${citiesData.length}
  Areas (LKO):  ${lucknowAreas.length}
  Categories:   ${catData.length}
  Services:     ${servicesData.length}
  Pricing rows: ${pricingCount}
  Staff:        ${staffData.length}
  Coupons:      3
  Flags:        ${flags.length}

  🔑 Staff Login → POST /api/v1/auth/staff/login
     Password: ${defaultPassword}
     admin@inistnt.com     → SUPER_ADMIN
     lko@inistnt.com       → CITY_MANAGER
     support1@inistnt.com  → SUPPORT_AGENT
  `);
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
