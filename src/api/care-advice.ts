import { jsonResponse, errorResponse } from '../utils/response-utils';

export async function handleCareAdviceRequest(
  request: Request,
  env: any
): Promise<Response> {
  try {
    const body = await request.json() as any;
    const { weather, pots = [] } = body;

    if (!weather || !weather.current) {
      return errorResponse('Missing weather data', 400);
    }

    const adviceList: any[] = [];
    const temp = weather.current.temp;
    const humidity = weather.current.humidity;
    const rainChance = (weather.forecast && weather.forecast[0]?.rain_chance) || 0;
    const currentMonth = new Date().getMonth() + 1;

    // 1. 温度规则
    if (temp > 30) {
      adviceList.push({
        type: "temperature",
        advice: "高温天气，请为植物遮阴，增加浇水频率",
        priority: "high",
        condition: `当前温度: ${temp}°C`
      });
    } else if (temp < 5) {
      adviceList.push({
        type: "temperature",
        advice: "低温预警，请将怕冻植物移至室内，减少浇水",
        priority: "high",
        condition: `当前温度: ${temp}°C`
      });
    }

    // 2. 湿度规则
    if (humidity < 30) {
      adviceList.push({
        type: "humidity",
        advice: "空气干燥，建议为喜湿植物喷水增湿",
        priority: "medium",
        condition: `当前湿度: ${humidity}%`
      });
    }

    // 3. 降雨规则
    if (rainChance > 50) {
      adviceList.push({
        type: "rainfall",
        advice: "有降雨可能，可适当减少浇水计划",
        priority: "medium",
        condition: `降雨概率: ${rainChance}%`
      });
    }

    // 4. 季节规则
    if (currentMonth >= 3 && currentMonth <= 5) {
      adviceList.push({ type: "seasonal", advice: "春季是生长旺季，适合换盆和施肥", priority: "medium", condition: "当前季节: 春季" });
    } else if (currentMonth >= 6 && currentMonth <= 8) {
      adviceList.push({ type: "seasonal", advice: "夏季高温，注意遮阴和增加浇水", priority: "medium", condition: "当前季节: 夏季" });
    } else if (currentMonth >= 9 && currentMonth <= 11) {
      adviceList.push({ type: "seasonal", advice: "秋季逐渐减少施肥，准备越冬", priority: "medium", condition: "当前季节: 秋季" });
    } else {
      adviceList.push({ type: "seasonal", advice: "冬季休眠期，控制浇水，保持温暖", priority: "medium", condition: "当前季节: 冬季" });
    }

    // 排序逻辑 (High > Medium > Low)
    const priorityMap: any = { high: 3, medium: 2, low: 1 };
    adviceList.sort((a, b) => priorityMap[b.priority] - priorityMap[a.priority]);

    return jsonResponse({
      success: true,
      data: adviceList
    });

  } catch (error) {
    console.error('Generate care advice error:', error);
    return errorResponse('生成养护建议失败', 500);
  }
}
