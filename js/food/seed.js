/* seed.js — ~50 Indian vegetarian staples (spec §11).
 * Everything is trust:"seed" (generic, NOT tuned to his kitchen) EXCEPT items
 * seeded from real label data. He will overwrite these with reality — the UI
 * shows a 🌱 badge so a guess is never mistaken for a measured value.
 * per100 values are per 100g (solids) / 100ml (liquids). Vegetarian only.
 */

/* builder: mk(id, name, basis, [kcal,protein,carbs,fat,fiber?], [[label,amount],...], opts) */
function _mk(id, name, basis, p, servings, opts){
  opts = opts || {};
  const per100 = { kcal:p[0], protein:p[1], carbs:p[2], fat:p[3] };
  if(p[4] != null) per100.fiber = p[4];
  return {
    id, name, brand: opts.brand || '', basis,
    per100,
    servings: (servings || []).map(s => ({ label:s[0], amount:s[1] })),
    defaultServingIndex: opts.def != null ? opts.def : (servings && servings.length ? 0 : -1),
    trust: opts.trust || 'seed',
    isHomeCooked: !!opts.home,
    aliases: opts.aliases || [],
    tags: opts.tags || [],
    notes: opts.notes || '',
    useCount: 0,
    source: opts.source || 'seed'
  };
}

const FOOD_SEED = [
  /* ── Grains & breads ── */
  _mk('seed_roti','Roti / Chapati','g',[297,11,50,7,3.4],[['1 roti (40g)',40],['2 roti',80]],{tags:['grain']}),
  _mk('seed_paratha','Paratha (plain)','g',[326,7,45,13,3],[['1 paratha (60g)',60]],{home:true,tags:['grain']}),
  _mk('seed_naan','Butter Naan','g',[310,9,48,9,2],[['1 naan (90g)',90]],{tags:['grain']}),
  _mk('seed_rice','White Rice (cooked)','g',[130,2.7,28,0.3,0.4],[['1 katori (150g)',150]],{tags:['grain']}),
  _mk('seed_jeerarice','Jeera Rice','g',[165,3,30,4,0.6],[['1 katori (150g)',150]],{home:true,tags:['grain']}),
  _mk('seed_poha','Poha (cooked)','g',[130,2.5,24,3,1],[['1 plate (200g)',200]],{home:true,tags:['grain']}),
  _mk('seed_upma','Upma','g',[145,3.5,22,5,1.5],[['1 katori (180g)',180]],{home:true,tags:['grain']}),
  _mk('seed_idli','Idli','g',[135,4,26,0.5,1],[['1 idli (40g)',40],['2 idli',80]],{tags:['grain']}),
  _mk('seed_dosa','Dosa (plain)','g',[168,4,30,4,1],[['1 dosa (80g)',80]],{home:true,tags:['grain']}),
  _mk('seed_breadwhite','Bread slice (white)','g',[265,9,49,3.2,2.7],[['1 slice (27g)',27]],{tags:['grain']}),
  _mk('seed_breadbrown','Bread slice (brown)','g',[250,10,44,3.5,6],[['1 slice (30g)',30]],{tags:['grain']}),

  /* ── Dals & legumes ── */
  _mk('seed_toordal','Toor Dal (cooked)','g',[120,6,18,2,4],[['1 katori (150g)',150]],{home:true,tags:['dal','protein']}),
  _mk('seed_moongdal','Moong Dal (cooked)','g',[105,7,15,1,4],[['1 katori (150g)',150]],{home:true,tags:['dal','protein']}),
  _mk('seed_chana','Chana Masala','g',[180,8,22,6,6],[['1 katori (150g)',150]],{home:true,tags:['legume','protein']}),
  _mk('seed_rajma','Rajma','g',[140,8,20,3,6],[['1 katori (150g)',150]],{home:true,tags:['legume','protein']}),
  _mk('seed_sambar','Sambar','g',[85,4,10,3,3],[['1 katori (150g)',150]],{home:true,tags:['dal']}),
  _mk('seed_dalmakhani','Dal Makhani','g',[185,7,15,10,5],[['1 katori (150g)',150]],{home:true,tags:['dal']}),

  /* ── Paneer & dairy ── */
  _mk('seed_paneer','Paneer (raw)','g',[265,18,1.2,21],[['1 cube (15g)',15],['100 g',100]],{def:1,tags:['dairy','protein']}),
  _mk('seed_paneerbhurji','Paneer Bhurji','g',[230,14,6,17,1],[['1 katori (150g)',150]],{home:true,tags:['dairy','protein']}),
  _mk('seed_palakpaneer','Palak Paneer','g',[160,8,6,12,2],[['1 katori (150g)',150]],{home:true,tags:['dairy','protein']}),
  _mk('seed_paneerlababdar','Paneer Lababdar','g',[200,9,8,15,1.5],[['1 katori (150g)',150]],{home:true,tags:['dairy']}),
  _mk('seed_paneertikka','Paneer Tikka','g',[230,18,6,15,1],[['4 pieces (120g)',120]],{home:true,tags:['dairy','protein']}),
  _mk('seed_curd','Curd / Dahi','g',[60,3.1,4.4,3.3],[['1 katori (150g)',150]],{tags:['dairy']}),
  _mk('seed_buttermilk','Buttermilk (chaas)','ml',[20,1,2,0.8],[['1 glass (200ml)',200]],{tags:['dairy']}),
  _mk('seed_milk','Milk (full cream)','ml',[62,3.2,4.8,3.3],[['1 glass (200ml)',200]],{tags:['dairy']}),

  /* ── Sabzis ── */
  _mk('seed_aloogobi','Aloo Gobi','g',[110,3,12,6,3],[['1 katori (150g)',150]],{home:true,tags:['sabzi']}),
  _mk('seed_bhindi','Bhindi (okra)','g',[120,2.5,8,9,3],[['1 katori (150g)',150]],{home:true,tags:['sabzi']}),
  _mk('seed_mixedveg','Mixed Veg','g',[100,3,10,6,3],[['1 katori (150g)',150]],{home:true,tags:['sabzi']}),
  _mk('seed_baingan','Baingan Bharta','g',[110,2.5,8,8,3],[['1 katori (150g)',150]],{home:true,tags:['sabzi']}),
  _mk('seed_jeeraaloo','Jeera Aloo','g',[130,2.5,18,6,2],[['1 katori (150g)',150]],{home:true,tags:['sabzi']}),
  _mk('seed_palak','Palak (sabzi)','g',[70,3,6,4,3],[['1 katori (150g)',150]],{home:true,tags:['sabzi']}),

  /* ── His known products (calibrate/verify) ── */
  _mk('seed_sidsfarm','Sids Farm High Protein Milk','ml',[63,10,5.4,0],[['1 can (250ml)',250]],{trust:'verified',brand:"Sid's Farm",source:'label-scan',tags:['dairy','protein'],notes:'From label: 1 can 250ml = 158 kcal, 25g protein.'}),
  _mk('seed_wholetruthwhey','Whole Truth WPI Whey','g',[373,90,1,1],[['1 scoop (30g)',30]],{brand:'The Whole Truth',tags:['protein','supplement'],notes:'Verify against your tub — WPI scoop weight varies.'}),
  _mk('seed_epigamia','Epigamia Greek Yogurt (plain)','g',[92,9,6,3],[['1 cup (90g)',90]],{brand:'Epigamia',tags:['dairy','protein']}),
  _mk('seed_brazilnuts','Brazil Nuts','g',[656,14,12,66,8],[['1 nut (5g)',5],['3 nuts',15]],{tags:['nuts']}),
  _mk('seed_curdreg','Curd (regular, homemade)','g',[62,3.4,4.7,3.3],[['1 katori (150g)',150]],{tags:['dairy']}),

  /* ── Snacks & misc ── */
  _mk('seed_banana','Banana','g',[89,1.1,23,0.3,2.6],[['1 medium (118g)',118]],{tags:['fruit']}),
  _mk('seed_apple','Apple','g',[52,0.3,14,0.2,2.4],[['1 medium (180g)',180]],{tags:['fruit']}),
  _mk('seed_almonds','Almonds','g',[579,21,22,50,12],[['10 almonds (12g)',12]],{tags:['nuts']}),
  _mk('seed_peanuts','Peanuts (roasted)','g',[567,26,16,49,8.5],[['1 handful (30g)',30]],{tags:['nuts','protein']}),
  _mk('seed_roastedchana','Roasted Chana','g',[364,18,61,6,18],[['1 katori (40g)',40]],{tags:['legume','protein']}),
  _mk('seed_oats','Oats (dry)','g',[389,17,66,7,10],[['1/2 cup (40g)',40]],{tags:['grain']}),
  _mk('seed_peanutbutter','Peanut Butter','g',[588,25,20,50,6],[['1 tbsp (16g)',16]],{tags:['protein']}),
  _mk('seed_ghee','Ghee','g',[900,0,0,100],[['1 tsp (5g)',5],['1 tbsp (14g)',14]],{tags:['oil','fat']}),
  _mk('seed_oil','Cooking Oil','g',[884,0,0,100],[['1 tsp (5g)',5],['1 tbsp (14g)',14]],{tags:['oil','fat'],notes:'Also captured automatically via the oil chip at log time.'}),
  _mk('seed_sprouts','Moong Sprouts','g',[100,7,12,1,4],[['1 katori (100g)',100]],{tags:['legume','protein']}),
  _mk('seed_boiledegg_paneer','Boiled Paneer Cubes','g',[265,18,1.2,21],[['4 cubes (60g)',60]],{tags:['dairy','protein']}),
  _mk('seed_daliceberg','Green Salad','g',[25,1.2,5,0.2,2],[['1 bowl (100g)',100]],{tags:['veg']}),
  _mk('seed_dhokla','Dhokla','g',[160,6,24,4,2],[['2 pieces (80g)',80]],{tags:['snack']}),
  _mk('seed_coffee','Milk Coffee (sugar)','ml',[55,1.6,7,2],[['1 cup (150ml)',150]],{tags:['beverage']})
];

/* Alternate names so searching either term finds the item (spec: roti↔chapati, dahi↔curd, …) */
const _SEED_ALIASES = {
  seed_roti:['chapati','chapatti','phulka','fulka','rotli'],
  seed_paratha:['parantha'],
  seed_naan:['nan'],
  seed_rice:['chawal','bhaat','steamed rice'],
  seed_jeerarice:['cumin rice'],
  seed_poha:['pohe','flattened rice'],
  seed_curd:['dahi','yogurt','yoghurt'],
  seed_curdreg:['dahi','yogurt'],
  seed_buttermilk:['chaas','chhachh','mattha'],
  seed_milk:['doodh'],
  seed_paneer:['cottage cheese'],
  seed_toordal:['arhar dal','tur dal','tuvar dal','pigeon pea'],
  seed_moongdal:['moong dal','yellow dal','mung dal'],
  seed_chana:['chole','chhole','chickpea','chickpeas'],
  seed_rajma:['kidney beans'],
  seed_sprouts:['ankurit','sprouted moong'],
  seed_roastedchana:['bhuna chana','roasted gram'],
  seed_banana:['kela'],
  seed_apple:['seb'],
  seed_almonds:['badam'],
  seed_peanuts:['moongphali','groundnut','groundnuts'],
  seed_peanutbutter:['pb'],
  seed_oats:['oatmeal'],
  seed_ghee:['clarified butter','desi ghee'],
  seed_oil:['refined oil','sunflower oil'],
  seed_dhokla:['khaman'],
  seed_daliceberg:['salad'],
  seed_palak:['spinach'],
  seed_bhindi:['okra','lady finger','ladyfinger'],
  seed_baingan:['brinjal','eggplant','aubergine'],
  seed_aloogobi:['aloo gobhi','potato cauliflower'],
  seed_wholetruthwhey:['whey','protein powder','wpi','isolate'],
  seed_sidsfarm:['sids milk','high protein milk']
};
FOOD_SEED.forEach(it => { if(_SEED_ALIASES[it.id]) it.aliases = _SEED_ALIASES[it.id]; });
