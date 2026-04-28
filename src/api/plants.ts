import { jsonResponse, errorResponse } from '../utils/response-utils';
import { deleteMemoryCachePrefix, getMemoryCache, setMemoryCache } from '../utils/cache-utils';

// 植物数据结构
interface PlantData {
  id: string;
  name: string;
  scientificName?: string;
  family?: string;
  careTips?: string[];
  wateringFrequency?: string;
  sunlightRequirements?: string;
  temperatureRange?: string;
  humidityRequirements?: string;
  soilType?: string;
  fertilization?: string;
  pruning?: string;
  commonProblems?: string[];
  imageUrl?: string;
}

// 植物数据库（示例数据）
const PLANT_DATABASE: PlantData[] = [
  {
    id: '1',
    name: '玫瑰',
    scientificName: 'Rosa',
    family: '蔷薇科',
    careTips: [
      '需要充足的阳光，每天至少6小时',
      '保持土壤湿润但不要积水',
      '定期施肥，春季和夏季每月一次',
      '及时修剪枯枝和病叶'
    ],
    wateringFrequency: '每周2-3次，夏季增加频率',
    sunlightRequirements: '全日照',
    temperatureRange: '15-25°C',
    humidityRequirements: '中等湿度',
    soilType: '肥沃、排水良好的土壤',
    fertilization: '春季和夏季使用玫瑰专用肥',
    pruning: '冬季休眠期进行重剪',
    commonProblems: ['黑斑病', '白粉病', '蚜虫'],
    imageUrl: '/assets/images/icons/icons-default-pot.png'
  },
  {
    id: '2',
    name: '月季',
    scientificName: 'Rosa chinensis',
    family: '蔷薇科',
    careTips: [
      '喜欢阳光充足的环境',
      '保持土壤湿润，避免干旱',
      '定期施肥促进开花',
      '及时摘除残花'
    ],
    wateringFrequency: '每周2-3次',
    sunlightRequirements: '全日照',
    temperatureRange: '18-28°C',
    humidityRequirements: '中等湿度',
    soilType: '疏松肥沃的土壤',
    fertilization: '生长季节每月施肥一次',
    pruning: '花后修剪',
    commonProblems: ['红蜘蛛', '白粉病'],
    imageUrl: '/assets/images/icons/icons-default-pot.png'
  },
  {
    id: '3',
    name: '牡丹',
    scientificName: 'Paeonia suffruticosa',
    family: '芍药科',
    careTips: [
      '需要充足的阳光',
      '排水良好的土壤很重要',
      '春季施肥促进生长',
      '花后及时修剪'
    ],
    wateringFrequency: '每周1-2次',
    sunlightRequirements: '全日照',
    temperatureRange: '15-25°C',
    humidityRequirements: '中等湿度',
    soilType: '肥沃、排水良好的土壤',
    fertilization: '春季施用有机肥',
    pruning: '花后修剪',
    commonProblems: ['根腐病', '叶斑病'],
    imageUrl: '/assets/images/icons/icons-default-pot.png'
  },
  {
    id: '4',
    name: '菊花',
    scientificName: 'Chrysanthemum',
    family: '菊科',
    careTips: [
      '喜欢凉爽的气候',
      '需要充足的阳光',
      '保持土壤湿润',
      '定期摘心促进分枝'
    ],
    wateringFrequency: '每周2-3次',
    sunlightRequirements: '全日照',
    temperatureRange: '15-20°C',
    humidityRequirements: '中等湿度',
    soilType: '肥沃、排水良好的土壤',
    fertilization: '生长季节每2周施肥一次',
    pruning: '定期摘心',
    commonProblems: ['蚜虫', '白粉病'],
    imageUrl: '/assets/images/icons/icons-default-pot.png'
  },
  {
    id: '5',
    name: '兰花',
    scientificName: 'Orchidaceae',
    family: '兰科',
    careTips: [
      '喜欢温暖湿润的环境',
      '避免阳光直射',
      '使用专门的兰花介质',
      '保持适当的湿度'
    ],
    wateringFrequency: '每周1次，冬季减少',
    sunlightRequirements: '散射光',
    temperatureRange: '18-25°C',
    humidityRequirements: '高湿度',
    soilType: '兰花专用介质',
    fertilization: '使用兰花专用肥，稀释后施用',
    pruning: '花后修剪花梗',
    commonProblems: ['根腐病', '介壳虫'],
    imageUrl: '/assets/images/icons/icons-default-pot.png'
  },
  {
    id: '6',
    name: '多肉植物',
    scientificName: 'Succulent plants',
    family: '多种',
    careTips: [
      '需要充足的阳光',
      '浇水要少，避免积水',
      '使用排水良好的土壤',
      '冬季减少浇水'
    ],
    wateringFrequency: '每2-3周一次',
    sunlightRequirements: '全日照',
    temperatureRange: '15-30°C',
    humidityRequirements: '低湿度',
    soilType: '多肉专用土',
    fertilization: '生长季节每月施肥一次',
    pruning: '去除枯叶',
    commonProblems: ['烂根', '介壳虫'],
    imageUrl: '/assets/images/icons/icons-default-pot.png'
  },
  {
    id: '7',
    name: '仙人掌',
    scientificName: 'Cactaceae',
    family: '仙人掌科',
    careTips: [
      '需要充足的阳光',
      '极少浇水',
      '使用沙质土壤',
      '冬季保持干燥'
    ],
    wateringFrequency: '每月1-2次',
    sunlightRequirements: '全日照',
    temperatureRange: '20-35°C',
    humidityRequirements: '低湿度',
    soilType: '沙质土壤',
    fertilization: '生长季节每2个月施肥一次',
    pruning: '一般不修剪',
    commonProblems: ['烂根', '介壳虫'],
    imageUrl: '/assets/images/icons/icons-default-pot.png'
  },
  {
    id: '8',
    name: '绿萝',
    scientificName: 'Epipremnum aureum',
    family: '天南星科',
    careTips: [
      '耐阴，但喜欢散射光',
      '保持土壤湿润',
      '可以水培',
      '定期擦拭叶片'
    ],
    wateringFrequency: '每周1-2次',
    sunlightRequirements: '散射光',
    temperatureRange: '18-30°C',
    humidityRequirements: '中等湿度',
    soilType: '通用盆栽土',
    fertilization: '生长季节每月施肥一次',
    pruning: '修剪过长的枝条',
    commonProblems: ['叶斑病', '红蜘蛛'],
    imageUrl: '/assets/images/icons/icons-default-pot.png'
  }
];

function isLocalDevelopmentRequest(request: Request): boolean {
  try {
    const hostname = new URL(request.url).hostname;
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

function isPlantsDatabaseUnavailable(error: unknown): boolean {
  const message = String((error as any)?.message || error || '');
  return /no such table:\s*plants|no such table:\s*plant_synonyms|数据库未配置/i.test(message);
}

function normalizePlantText(text?: string): string {
  return String(text || '').trim().toLowerCase();
}

function buildFallbackCareGuide(plant: PlantData) {
  const problems = plant.commonProblems?.length
    ? plant.commonProblems.join('、')
    : '蚜虫、红蜘蛛等常见病虫害';

  return {
    watering: `春季保持${plant.wateringFrequency || '见干见湿'}；夏季高温时注意早晚补水并避免积水；秋季随着降温逐步减少浇水；冬季控水并保持盆土不过湿。`,
    fertilizing: `春季可结合${plant.fertilization || '薄肥勤施'}促进生长；夏季高温期减少浓肥；秋季可少量补肥帮助恢复；冬季通常减少或暂停施肥。`,
    pruning: `春季适合轻剪整形；夏季及时清理黄叶病叶；秋季可适度整理株型；冬季按植株状态${plant.pruning || '进行轻度修剪'}。`,
    soilRequirement: `春季适合检查根系并使用${plant.soilType || '疏松透气、排水良好的基质'}；夏季避免闷根积水；秋季可补充新土；冬季注意保温与排水。`,
    pests: `春夏重点留意${problems}；秋季注意通风并及时观察叶片；冬季清理枯叶病叶，减少病虫害滋生。`
  };
}

function buildFallbackPlantRecord(plant: PlantData) {
  return {
    id: plant.id,
    name: plant.name,
    category: plant.family || '本地样例',
    care_difficulty: '中等',
    basic_info: {
      scientificName: plant.scientificName || '',
      family: plant.family || '',
      humidityRequirements: plant.humidityRequirements || '',
      sunlightRequirements: plant.sunlightRequirements || '',
      temperatureRange: plant.temperatureRange || ''
    },
    ornamental_features: {
      careTips: plant.careTips || []
    },
    care_guide: buildFallbackCareGuide(plant),
    image_url: plant.imageUrl || '/assets/images/icons/icons-default-pot.png'
  };
}

function getFallbackPlantSearchBlob(plant: PlantData): string {
  return [
    plant.id,
    plant.name,
    plant.scientificName,
    plant.family,
    plant.wateringFrequency,
    plant.sunlightRequirements,
    plant.temperatureRange,
    plant.humidityRequirements,
    plant.soilType,
    plant.fertilization,
    plant.pruning,
    ...(plant.careTips || []),
    ...(plant.commonProblems || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function searchFallbackPlants(query: string, limit: number = 20) {
  const normalizedQuery = normalizePlantText(query);
  if (!normalizedQuery) {
    return [];
  }

  return PLANT_DATABASE
    .map((plant) => ({
      plant,
      blob: getFallbackPlantSearchBlob(plant)
    }))
    .filter(({ plant, blob }) => (
      normalizePlantText(plant.name) === normalizedQuery ||
      normalizePlantText(plant.id) === normalizedQuery ||
      blob.includes(normalizedQuery)
    ))
    .slice(0, limit)
    .map(({ plant }) => buildFallbackPlantRecord(plant));
}

function findFallbackPlantById(plantId: string) {
  const normalizedId = normalizePlantText(plantId);
  return PLANT_DATABASE.find((plant) => (
    normalizePlantText(plant.id) === normalizedId ||
    normalizePlantText(plant.name) === normalizedId
  )) || null;
}

function findFallbackSmartMatch(potName?: string, potNote?: string) {
  const normalizedPotName = normalizePlantText(potName);
  const combinedText = `${potName || ''} ${potNote || ''}`.trim();
  const keywords = extractSmartMatchKeywords(combinedText);

  if (normalizedPotName) {
    const directMatch = PLANT_DATABASE.find((plant) => (
      normalizePlantText(plant.name) === normalizedPotName ||
      normalizePlantText(plant.id) === normalizedPotName ||
      normalizePlantText(plant.scientificName) === normalizedPotName
    ));

    if (directMatch) {
      return {
        data: buildFallbackPlantRecord(directMatch),
        message: `本地样例直接匹配成功: ${directMatch.name}`,
        matchType: 'local-direct',
        matchScore: 10
      };
    }
  }

  let bestPlant: PlantData | null = null;
  let highestScore = 0;

  for (const plant of PLANT_DATABASE) {
    const blob = getFallbackPlantSearchBlob(plant);
    let score = 0;

    if (normalizedPotName) {
      if (blob.includes(normalizedPotName)) {
        score += 6;
      }
      if (normalizePlantText(plant.name).includes(normalizedPotName)) {
        score += 4;
      }
    }

    for (const keyword of keywords) {
      const normalizedKeyword = normalizePlantText(keyword);
      if (!normalizedKeyword) continue;

      if (normalizePlantText(plant.name) === normalizedKeyword) {
        score += 8;
      } else if (blob.includes(normalizedKeyword)) {
        score += normalizedKeyword.length >= 3 ? 3 : 1;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestPlant = plant;
    }
  }

  if (!bestPlant || highestScore <= 0) {
    return null;
  }

  return {
    data: buildFallbackPlantRecord(bestPlant),
    message: `本地样例匹配成功: ${bestPlant.name}`,
    keywords,
    matchType: 'local-keyword',
    matchScore: highestScore
  };
}

export async function handlePlantsRequest(
  request: Request,
  env: any,
  path: string,
  url: URL
): Promise<Response> {
  // 批量智能植物匹配API
  if (path === '/api/plants/smart-match/batch' && request.method === 'POST') {
    return handleSmartMatchBatch(request, env);
  }

  // 智能植物匹配API
  if (path === '/api/plants/smart-match' && request.method === 'POST') {
    return handleSmartMatch(request, env);
  }

  // 植物搜索API
  if (path === '/api/plants/search' && request.method === 'GET') {
    return handlePlantSearch(request, env, url);
  }

  // 获取特定植物信息
  if (path.startsWith('/api/plants/') && request.method === 'GET') {
    const plantId = path.split('/').pop();
    return handleGetPlantInfo(request, plantId, env);
  }

  return errorResponse('Not Found', 404);
}

// 中文停用词列表（常见虚词）
const STOP_WORDS = new Set([
  '的', '我', '你', '他', '她', '它', '们', '这', '那', '个', '一', '是', '在', '有',
  '和', '与', '了', '着', '过', '就', '都', '而', '及', '其', '或', '但', '如', '所',
  '上', '下', '左', '右', '前', '后', '里', '外', '中', '大', '小', '老', '新', '好',
  '很', '太', '也', '又', '还', '只', '不', '没', '被', '把', '给', '让', '从', '向',
  '到', '对', '为', '以', '于', '用', '等', '去', '来', '能', '会', '可', '要', '得',
  '地', '吗', '呢', '吧', '啊', '哦', '嗯', '呀', '哈', '哟', '喂', '嘿', '唉', '哎',
  '盆', '花盆', '植物', '盆栽', '养', '种', '买', '送', '客厅', '阳台', '卧室', '书房',
  '办公室', '家里', '公司', '朋友', '妈妈', '爸爸', '奶奶', '爷爷', '姥姥', '姥爷'
]);

const SMART_MATCH_KEYWORD_LIMIT = 12;

// 从文本中提取可能的植物关键词
function extractKeywords(text: string): string[] {
  if (!text) return [];

  const keywords: string[] = [];
  const cleanText = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').trim();

  // 分词：按空格和常见分隔符拆分
  const words = cleanText.split(/\s+/).filter(w => w.length >= 2);

  for (const word of words) {
    if (!STOP_WORDS.has(word) && word.length >= 2 && word.length <= 8) {
      keywords.push(word);
    }
  }

  // 提取 2-4 字的滑动窗口片段（用于捕获复合词）
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i <= cleanText.length - len; i++) {
      const segment = cleanText.substring(i, i + len);
      if (!/\s/.test(segment) && !STOP_WORDS.has(segment)) {
        if (!keywords.includes(segment)) {
          keywords.push(segment);
        }
      }
    }
  }

  return keywords;
}

function extractSmartMatchKeywords(text: string): string[] {
  return extractKeywords(text).slice(0, SMART_MATCH_KEYWORD_LIMIT);
}

type PlantRecord = Record<string, any> & {
  id: string;
  name: string;
  category?: string | null;
  care_difficulty?: string | null;
  basic_info: Record<string, any>;
  ornamental_features: Record<string, any>;
  care_guide: Record<string, any>;
  image_url?: string | null;
};

type PlantSearchEntry = {
  value: string;
  plant: PlantRecord;
};

type PlantIndex = {
  plants: PlantRecord[];
  byId: Map<string, PlantRecord>;
  byName: Map<string, PlantRecord>;
  bySynonym: Map<string, PlantRecord>;
  nameEntries: PlantSearchEntry[];
  idEntries: PlantSearchEntry[];
  synonymEntries: PlantSearchEntry[];
  loadedAt: number;
};

type SmartMatchInput = {
  potName?: string;
  potNote?: string;
};

type SmartMatchResult = {
  success: true;
  data: PlantRecord | Record<string, any> | null;
  message: string;
  keywords?: string[];
  matchType?: string;
  matchScore?: number;
};

const PLANT_CACHE_PREFIX = 'plants:';
const PLANT_INDEX_CACHE_KEY = `${PLANT_CACHE_PREFIX}index:v1`;
const PLANT_INDEX_TTL_MS = 10 * 60 * 1000;
let plantIndexLoadPromise: Promise<PlantIndex> | null = null;

export function invalidatePlantCache(): number {
  return deleteMemoryCachePrefix(PLANT_CACHE_PREFIX);
}

function parsePlantJsonField(value: any): Record<string, any> {
  if (!value) {
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeDbPlant(row: any): PlantRecord | null {
  const id = String(row?.id || '').trim();
  const name = String(row?.name || '').trim();
  if (!id || !name) {
    return null;
  }

  return {
    ...row,
    id,
    name,
    category: row.category || null,
    care_difficulty: row.care_difficulty || null,
    basic_info: parsePlantJsonField(row.basic_info),
    ornamental_features: parsePlantJsonField(row.ornamental_features),
    care_guide: parsePlantJsonField(row.care_guide),
    image_url: row.image_url || null
  };
}

function clonePlantForResponse(plant: PlantRecord): PlantRecord {
  return {
    ...plant,
    basic_info: { ...(plant.basic_info || {}) },
    ornamental_features: { ...(plant.ornamental_features || {}) },
    care_guide: { ...(plant.care_guide || {}) }
  };
}

function toPlantSearchResult(plant: PlantRecord) {
  return {
    id: plant.id,
    name: plant.name,
    category: plant.category || null,
    care_difficulty: plant.care_difficulty || null
  };
}

function addFirstMapValue(map: Map<string, PlantRecord>, key: string, plant: PlantRecord) {
  if (key && !map.has(key)) {
    map.set(key, plant);
  }
}

async function getPlantIndex(env: any): Promise<PlantIndex> {
  const cached = getMemoryCache<PlantIndex>(PLANT_INDEX_CACHE_KEY);
  if (cached) {
    return cached;
  }

  if (!plantIndexLoadPromise) {
    plantIndexLoadPromise = loadPlantIndex(env).finally(() => {
      plantIndexLoadPromise = null;
    });
  }

  return plantIndexLoadPromise;
}

async function loadPlantIndex(env: any): Promise<PlantIndex> {
  const [plantRows, synonymRows] = await Promise.all([
    env.DB.prepare('SELECT * FROM plants ORDER BY name ASC').all(),
    env.DB.prepare('SELECT plant_id, synonym FROM plant_synonyms ORDER BY synonym ASC').all()
  ]);

  const plants = (plantRows.results || [])
    .map(normalizeDbPlant)
    .filter(Boolean) as PlantRecord[];
  const byId = new Map<string, PlantRecord>();
  const byName = new Map<string, PlantRecord>();
  const bySynonym = new Map<string, PlantRecord>();
  const nameEntries: PlantSearchEntry[] = [];
  const idEntries: PlantSearchEntry[] = [];
  const synonymEntries: PlantSearchEntry[] = [];

  for (const plant of plants) {
    const normalizedId = normalizePlantText(plant.id);
    const normalizedName = normalizePlantText(plant.name);

    addFirstMapValue(byId, normalizedId, plant);
    addFirstMapValue(byName, normalizedName, plant);

    if (normalizedId) {
      idEntries.push({ value: normalizedId, plant });
    }
    if (normalizedName) {
      nameEntries.push({ value: normalizedName, plant });
    }
  }

  for (const row of synonymRows.results || []) {
    const plant = byId.get(normalizePlantText(row.plant_id));
    const synonym = normalizePlantText(row.synonym);
    if (!plant || !synonym) {
      continue;
    }

    addFirstMapValue(bySynonym, synonym, plant);
    synonymEntries.push({ value: synonym, plant });
  }

  return setMemoryCache(PLANT_INDEX_CACHE_KEY, {
    plants,
    byId,
    byName,
    bySynonym,
    nameEntries,
    idEntries,
    synonymEntries,
    loadedAt: Date.now()
  }, PLANT_INDEX_TTL_MS);
}

function addUniquePlant(results: PlantRecord[], seen: Set<string>, plant: PlantRecord, limit: number): boolean {
  const key = normalizePlantText(plant.id);
  if (!key || seen.has(key)) {
    return results.length >= limit;
  }

  seen.add(key);
  results.push(plant);
  return results.length >= limit;
}

function findDirectPlantMatch(index: PlantIndex, value: string): PlantRecord | null {
  const normalizedValue = normalizePlantText(value);
  if (!normalizedValue) {
    return null;
  }

  return index.byName.get(normalizedValue)
    || index.bySynonym.get(normalizedValue)
    || index.byId.get(normalizedValue)
    || null;
}

function findPrefixPlantMatch(index: PlantIndex, value: string): PlantRecord | null {
  const normalizedValue = normalizePlantText(value);
  if (!normalizedValue) {
    return null;
  }

  const nameMatch = index.nameEntries.find((entry) => entry.value.startsWith(normalizedValue));
  if (nameMatch) {
    return nameMatch.plant;
  }

  return index.synonymEntries.find((entry) => entry.value.startsWith(normalizedValue))?.plant || null;
}

function searchPlantIndex(index: PlantIndex, query: string, limit = 20): PlantRecord[] {
  const normalizedQuery = normalizePlantText(query);
  if (!normalizedQuery) {
    return [];
  }

  const results: PlantRecord[] = [];
  const seen = new Set<string>();

  for (const entry of index.nameEntries) {
    if (entry.value.startsWith(normalizedQuery) && addUniquePlant(results, seen, entry.plant, limit)) {
      return results;
    }
  }

  for (const entry of index.idEntries) {
    if (entry.value.startsWith(normalizedQuery) && addUniquePlant(results, seen, entry.plant, limit)) {
      return results;
    }
  }

  for (const entry of index.synonymEntries) {
    if (entry.value.startsWith(normalizedQuery) && addUniquePlant(results, seen, entry.plant, limit)) {
      return results;
    }
  }

  return results;
}

async function runSmartMatch(
  env: any,
  input: SmartMatchInput,
  allowLocalFallback: boolean
): Promise<SmartMatchResult> {
  const potName = input.potName;
  const potNote = input.potNote;
  try {
    if (!potName && !potNote) {
      return { success: true, data: null, message: '无输入内容' };
    }

    if (!env.DB) {
      if (allowLocalFallback) {
        const fallbackMatch = findFallbackSmartMatch(potName, potNote);
        return {
          success: true,
          data: fallbackMatch?.data || null,
          message: fallbackMatch?.message || '本地样例中未找到匹配植物',
          matchType: fallbackMatch?.matchType || 'local-none',
          matchScore: fallbackMatch?.matchScore || 0,
          keywords: fallbackMatch?.keywords || []
        };
      }

      throw new Error('数据库未配置');
    }

    const plantIndex = await getPlantIndex(env);

    // 第一步：尝试直接匹配花盆名（最高优先级 - 先精确匹配主名称）
    if (potName && potName.trim()) {
      const trimmedPotName = potName.trim();
      const directMatch = findDirectPlantMatch(plantIndex, trimmedPotName)
        || findPrefixPlantMatch(plantIndex, trimmedPotName);

      if (directMatch) {
        return {
          success: true,
          message: `直接匹配成功: ${directMatch.name}`,
          data: clonePlantForResponse(directMatch),
          matchType: 'direct',
          matchScore: 10
        };
      }
    }

    // 第二步：关键词提取匹配（备选方案）
    const combinedText = `${potName || ''} ${potNote || ''}`;
    const keywords = extractSmartMatchKeywords(combinedText);

    if (keywords.length === 0) {
      return { success: true, data: null, message: '未提取到有效关键词' };
    }

    // 构建多关键词查询
    let bestMatch: PlantRecord | null = null;
    let highestScore = 0;

    const keywordMatches = keywords.map((keyword) => ({
      keyword,
      results: searchPlantIndex(plantIndex, keyword, 5)
    }));

    for (const { keyword, results } of keywordMatches) {
      for (const result of results) {
        const normalizedKeyword = normalizePlantText(keyword);
        const normalizedResultName = normalizePlantText(result.name);
        // 计算匹配分数（名称完全匹配得分最高）
        let score = 1;
        if (normalizedResultName === normalizedKeyword) score = 10;
        else if (normalizedResultName.includes(normalizedKeyword)) score = 5;
        else if (normalizedKeyword.includes(normalizedResultName)) score = 8; // 关键词包含植物名

        if (score > highestScore) {
          highestScore = score;
          bestMatch = result;
        }
      }

      // 保留原来的关键词优先级：前面的完全匹配优先。
      if (highestScore >= 10) break;
    }

    if (bestMatch) {
      return {
        success: true,
        message: `匹配成功: ${bestMatch.name}`,
        data: clonePlantForResponse(bestMatch),
        keywords: keywords,
        matchScore: highestScore
      };
    }

    if (allowLocalFallback) {
      const fallbackMatch = findFallbackSmartMatch(potName, potNote);
      if (fallbackMatch) {
        return {
          success: true,
          data: fallbackMatch.data,
          message: fallbackMatch.message,
          keywords: fallbackMatch.keywords || keywords,
          matchType: fallbackMatch.matchType,
          matchScore: fallbackMatch.matchScore
        };
      }
    }

    return {
      success: true,
      data: null,
      message: '未找到匹配的植物',
      keywords: keywords
    };

  } catch (error) {
    if (allowLocalFallback && isPlantsDatabaseUnavailable(error)) {
      const fallbackMatch = findFallbackSmartMatch(potName, potNote);
      return {
        success: true,
        data: fallbackMatch?.data || null,
        message: fallbackMatch?.message || '本地样例中未找到匹配植物',
        keywords: fallbackMatch?.keywords || [],
        matchType: fallbackMatch?.matchType || 'local-none',
        matchScore: fallbackMatch?.matchScore || 0
      };
    }

    throw error;
  }
}

// 智能植物匹配
async function handleSmartMatch(request: Request, env: any): Promise<Response> {
  const allowLocalFallback = isLocalDevelopmentRequest(request);

  try {
    const body = await request.json() as SmartMatchInput;
    const result = await runSmartMatch(env, body, allowLocalFallback);
    return jsonResponse(result);
  } catch (error) {
    console.error('智能匹配错误:', error);
    return errorResponse('智能匹配失败', 500);
  }
}

async function handleSmartMatchBatch(request: Request, env: any): Promise<Response> {
  const allowLocalFallback = isLocalDevelopmentRequest(request);

  try {
    const body = await request.json() as any;
    const rawItems = Array.isArray(body) ? body : body.items;
    if (!Array.isArray(rawItems)) {
      return errorResponse('Invalid items', 400);
    }

    const items = rawItems.slice(0, 40);
    const data = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index] || {};
      const key = String(item.key || item.potId || index);
      try {
        const result = await runSmartMatch(env, item, allowLocalFallback);
        data.push({
          key,
          potId: item.potId || null,
          ...result
        });
      } catch (error) {
        console.warn('批量智能匹配单项失败:', { key, potId: item.potId || null, error: String((error as any)?.message || error) });
        data.push({
          key,
          potId: item.potId || null,
          success: false,
          data: null,
          message: '智能匹配失败'
        });
      }
    }

    return jsonResponse({ success: true, data });
  } catch (error) {
    console.error('批量智能匹配错误:', error);
    return errorResponse('批量智能匹配失败', 500);
  }
}

// 处理植物搜索
async function handlePlantSearch(request: Request, env: any, url: URL): Promise<Response> {
  const allowLocalFallback = isLocalDevelopmentRequest(request);

  try {
    const query = url.searchParams.get('q') || '';

    if (!query.trim()) {
      return jsonResponse({
        success: true,
        message: '请输入搜索关键词',
        data: []
      });
    }

    if (!env.DB) {
      if (allowLocalFallback) {
        const fallbackResults = searchFallbackPlants(query).map((plant) => ({
          id: plant.id,
          name: plant.name,
          category: plant.category,
          care_difficulty: plant.care_difficulty
        }));

        return jsonResponse({
          success: true,
          message: `本地样例找到 ${fallbackResults.length} 个相关植物`,
          data: fallbackResults
        });
      }

      return errorResponse('数据库未配置', 500);
    }

    console.log('从植物索引搜索:', query);
    const plantIndex = await getPlantIndex(env);
    const results = searchPlantIndex(plantIndex, query, 20).map(toPlantSearchResult);

    if (results.length > 0 || !allowLocalFallback) {
      return jsonResponse({
        success: true,
        message: `找到 ${results.length} 个相关植物`,
        data: results
      });
    }

    const fallbackResults = searchFallbackPlants(query).map((plant) => ({
      id: plant.id,
      name: plant.name,
      category: plant.category,
      care_difficulty: plant.care_difficulty
    }));

    return jsonResponse({
      success: true,
      message: `本地样例找到 ${fallbackResults.length} 个相关植物`,
      data: fallbackResults
    });

  } catch (error) {
    console.error('植物搜索错误:', error);

    if (allowLocalFallback && isPlantsDatabaseUnavailable(error)) {
      const query = url.searchParams.get('q') || '';
      const fallbackResults = searchFallbackPlants(query).map((plant) => ({
        id: plant.id,
        name: plant.name,
        category: plant.category,
        care_difficulty: plant.care_difficulty
      }));

      return jsonResponse({
        success: true,
        message: `本地样例找到 ${fallbackResults.length} 个相关植物`,
        data: fallbackResults
      });
    }

    return errorResponse('搜索植物失败', 500);
  }
}

// 获取特定植物信息
async function handleGetPlantInfo(request: Request, plantId: string | undefined, env: any): Promise<Response> {
  const allowLocalFallback = isLocalDevelopmentRequest(request);

  try {
    if (!plantId) {
      return errorResponse('植物ID不能为空', 400);
    }

    if (!env.DB) {
      if (allowLocalFallback) {
        const fallbackPlant = findFallbackPlantById(plantId);
        if (fallbackPlant) {
          return jsonResponse({
            success: true,
            message: '获取本地样例植物信息成功',
            data: buildFallbackPlantRecord(fallbackPlant)
          });
        }
      }

      return errorResponse('数据库未配置', 500);
    }

    const plantIndex = await getPlantIndex(env);
    const plant = plantIndex.byId.get(normalizePlantText(plantId));

    if (!plant) {
      if (allowLocalFallback) {
        const fallbackPlant = findFallbackPlantById(plantId);
        if (fallbackPlant) {
          return jsonResponse({
            success: true,
            message: '获取本地样例植物信息成功',
            data: buildFallbackPlantRecord(fallbackPlant)
          });
        }
      }

      return errorResponse('植物未找到', 404);
    }

    return jsonResponse({
      success: true,
      message: '获取植物信息成功',
      data: clonePlantForResponse(plant)
    });

  } catch (error) {
    console.error('获取植物信息错误:', error);

    if (allowLocalFallback && plantId && isPlantsDatabaseUnavailable(error)) {
      const fallbackPlant = findFallbackPlantById(plantId);
      if (fallbackPlant) {
        return jsonResponse({
          success: true,
          message: '获取本地样例植物信息成功',
          data: buildFallbackPlantRecord(fallbackPlant)
        });
      }
    }

    return errorResponse('获取植物信息失败', 500);
  }
}
