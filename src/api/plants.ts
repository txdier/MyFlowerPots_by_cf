import { jsonResponse, errorResponse } from '../utils/response-utils';

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
    imageUrl: 'https://via.placeholder.com/300x200/FF69B4/FFFFFF?text=Rose'
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
    imageUrl: 'https://via.placeholder.com/300x200/FF1493/FFFFFF?text=Chinese+Rose'
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
    imageUrl: 'https://via.placeholder.com/300x200/800080/FFFFFF?text=Peony'
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
    imageUrl: 'https://via.placeholder.com/300x200/FFD700/FFFFFF?text=Chrysanthemum'
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
    imageUrl: 'https://via.placeholder.com/300x200/9370DB/FFFFFF?text=Orchid'
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
    imageUrl: 'https://via.placeholder.com/300x200/32CD32/FFFFFF?text=Succulent'
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
    imageUrl: 'https://via.placeholder.com/300x200/228B22/FFFFFF?text=Cactus'
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
    imageUrl: 'https://via.placeholder.com/300x200/008000/FFFFFF?text=Pothos'
  }
];

export async function handlePlantsRequest(
  request: Request,
  env: any,
  path: string,
  url: URL
): Promise<Response> {
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
    return handleGetPlantInfo(plantId, env);
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

// 智能植物匹配
async function handleSmartMatch(request: Request, env: any): Promise<Response> {
  try {
    const body = await request.json() as { potName?: string; potNote?: string };
    const { potName, potNote } = body;

    if (!potName && !potNote) {
      return jsonResponse({ success: true, data: null, message: '无输入内容' });
    }

    if (!env.DB) {
      return errorResponse('数据库未配置', 500);
    }

    // 第一步：尝试直接匹配花盆名（最高优先级 - 先精确匹配主名称）
    if (potName && potName.trim()) {
      // 优先级1：精确匹配主名称
      let directMatch = await env.DB.prepare(`
        SELECT id, name, category, care_difficulty,
               basic_info, ornamental_features, care_guide
        FROM plants
        WHERE name = ?
        LIMIT 1
      `).bind(potName.trim()).first();

      // 优先级2：如果主名称无精确匹配，尝试别名精确匹配
      if (!directMatch) {
        directMatch = await env.DB.prepare(`
          SELECT DISTINCT p.id, p.name, p.category, p.care_difficulty,
                 p.basic_info, p.ornamental_features, p.care_guide
          FROM plants p
          INNER JOIN plant_synonyms ps ON p.id = ps.plant_id
          WHERE ps.synonym = ?
          LIMIT 1
        `).bind(potName.trim()).first();
      }

      // 优先级3：如果仍无匹配，尝试模糊匹配（LIKE）
      if (!directMatch) {
        directMatch = await env.DB.prepare(`
          SELECT DISTINCT p.id, p.name, p.category, p.care_difficulty,
                 p.basic_info, p.ornamental_features, p.care_guide
          FROM plants p
          LEFT JOIN plant_synonyms ps ON p.id = ps.plant_id
          WHERE p.name LIKE ? OR ps.synonym LIKE ?
          LIMIT 1
        `).bind(`%${potName.trim()}%`, `%${potName.trim()}%`).first();
      }

      if (directMatch) {
        console.log('直接匹配成功:', directMatch.name);
        const plantData = {
          ...directMatch,
          basic_info: directMatch.basic_info ? JSON.parse(directMatch.basic_info) : {},
          ornamental_features: directMatch.ornamental_features ? JSON.parse(directMatch.ornamental_features) : {},
          care_guide: directMatch.care_guide ? JSON.parse(directMatch.care_guide) : {}
        };

        return jsonResponse({
          success: true,
          message: `直接匹配成功: ${directMatch.name}`,
          data: plantData,
          matchType: 'direct',
          matchScore: 10
        });
      }
    }

    // 第二步：关键词提取匹配（备选方案）
    const combinedText = `${potName || ''} ${potNote || ''}`;
    const keywords = extractKeywords(combinedText);

    console.log('智能匹配 - 提取关键词:', keywords);

    if (keywords.length === 0) {
      return jsonResponse({ success: true, data: null, message: '未提取到有效关键词' });
    }

    // 构建多关键词查询
    let bestMatch = null;
    let highestScore = 0;

    for (const keyword of keywords) {
      const { results } = await env.DB.prepare(`
        SELECT DISTINCT p.id, p.name, p.category, p.care_difficulty,
               p.basic_info, p.ornamental_features, p.care_guide
        FROM plants p
        LEFT JOIN plant_synonyms ps ON p.id = ps.plant_id
        WHERE p.name LIKE ? OR ps.synonym LIKE ?
        LIMIT 5
      `).bind(`%${keyword}%`, `%${keyword}%`).all();

      for (const result of results) {
        // 计算匹配分数（名称完全匹配得分最高）
        let score = 1;
        if (result.name === keyword) score = 10;
        else if (result.name.includes(keyword)) score = 5;
        else if (keyword.includes(result.name)) score = 8; // 关键词包含植物名

        if (score > highestScore) {
          highestScore = score;
          bestMatch = result;
        }
      }

      // 如果找到完全匹配，提前返回
      if (highestScore >= 10) break;
    }

    if (bestMatch) {
      // 解析 JSON 字段
      const plantData = {
        ...bestMatch,
        basic_info: bestMatch.basic_info ? JSON.parse(bestMatch.basic_info) : {},
        ornamental_features: bestMatch.ornamental_features ? JSON.parse(bestMatch.ornamental_features) : {},
        care_guide: bestMatch.care_guide ? JSON.parse(bestMatch.care_guide) : {}
      };

      return jsonResponse({
        success: true,
        message: `匹配成功: ${bestMatch.name}`,
        data: plantData,
        keywords: keywords,
        matchScore: highestScore
      });
    }

    return jsonResponse({
      success: true,
      data: null,
      message: '未找到匹配的植物',
      keywords: keywords
    });

  } catch (error) {
    console.error('智能匹配错误:', error);
    return errorResponse('智能匹配失败', 500);
  }
}

// 处理植物搜索
async function handlePlantSearch(request: Request, env: any, url: URL): Promise<Response> {
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
      return errorResponse('数据库未配置', 500);
    }

    console.log('从D1搜索植物:', query);
    const { results } = await env.DB.prepare(`
      SELECT DISTINCT p.id, p.name, p.category, p.care_difficulty 
      FROM plants p
      LEFT JOIN plant_synonyms ps ON p.id = ps.plant_id
      WHERE p.name LIKE ? OR p.id LIKE ? OR ps.synonym LIKE ?
      LIMIT 20
    `).bind(`%${query}%`, `%${query}%`, `%${query}%`).all();

    return jsonResponse({
      success: true,
      message: `找到 ${results.length} 个相关植物`,
      data: results
    });

  } catch (error) {
    console.error('植物搜索错误:', error);
    return errorResponse('搜索植物失败', 500);
  }
}

// 获取特定植物信息
async function handleGetPlantInfo(plantId: string | undefined, env: any): Promise<Response> {
  try {
    if (!plantId) {
      return errorResponse('植物ID不能为空', 400);
    }

    if (!env.DB) {
      return errorResponse('数据库未配置', 500);
    }

    const plant = await env.DB.prepare(
      "SELECT * FROM plants WHERE id = ?"
    ).bind(plantId).first();

    if (!plant) {
      return errorResponse('植物未找到', 404);
    }

    // 解析 JSON 字符串
    const plantData = {
      ...plant,
      basic_info: plant.basic_info ? JSON.parse(plant.basic_info) : {},
      ornamental_features: plant.ornamental_features ? JSON.parse(plant.ornamental_features) : {},
      care_guide: plant.care_guide ? JSON.parse(plant.care_guide) : {}
    };

    return jsonResponse({
      success: true,
      message: '获取植物信息成功',
      data: plantData
    });

  } catch (error) {
    console.error('获取植物信息错误:', error);
    return errorResponse('获取植物信息失败', 500);
  }
}

// 初始化植物数据到KV（可选）
export async function initPlantsData(env: any): Promise<void> {
  if (!env.PLANTS_KV) {
    console.log('PLANTS_KV未配置，跳过初始化');
    return;
  }

  try {
    console.log('开始初始化植物数据到KV...');

    for (const plant of PLANT_DATABASE) {
      await env.PLANTS_KV.put(plant.id, JSON.stringify(plant));
      console.log(`已保存植物: ${plant.name} (ID: ${plant.id})`);
    }

    console.log('植物数据初始化完成');
  } catch (error) {
    console.error('初始化植物数据失败:', error);
  }
}
