import { jsonResponse, errorResponse } from '../utils/response-utils';

export async function handleWeatherRequest(
  request: Request,
  env: any,
  url: URL
): Promise<Response> {
  // 优先获取请求中的位置参数，否则使用用户的真实 IP 进行定位
  let location = url.searchParams.get('location');
  
  if (!location || location === 'auto:ip') {
    // 从 Cloudflare 请求头中获取用户的真实 IP
    const clientIp = request.headers.get('CF-Connecting-IP');
    location = clientIp || 'auto:ip';
  }
  
  const apiKey = env.WEATHER_API_KEY || 'f70ad05dc8124f8eb3273837251504';

  try {
    // 1. 获取实时天气
    const currentUrl = `http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(location)}&aqi=yes&lang=zh`;
    const currentRes = await fetch(currentUrl);
    const currentWeather: any = await currentRes.json();

    if (currentWeather.error) {
      console.error('WeatherAPI error:', currentWeather.error);
      return errorResponse(currentWeather.error.message || '获取天气失败', 400);
    }

    // 2. 获取预报
    const forecastUrl = `http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(location)}&days=3&aqi=yes&alerts=yes&lang=zh`;
    const forecastRes = await fetch(forecastUrl);
    const forecast: any = await forecastRes.json();

    // 格式化输出 (保持与旧小程序兼容)
    return jsonResponse({
      success: true,
      data: {
        current: {
          temp: currentWeather.current.temp_c,
          condition: currentWeather.current.condition.text,
          humidity: currentWeather.current.humidity,
          wind: currentWeather.current.wind_kph,
          feelslike: currentWeather.current.feelslike_c,
          uv: currentWeather.current.uv,
          visibility: currentWeather.current.vis_km,
          pressure: currentWeather.current.pressure_mb,
          aqi: (currentWeather.current.air_quality && currentWeather.current.air_quality.pm2_5) || 0
        },
        location: {
          name: translateLocationName(currentWeather.location.region || currentWeather.location.name),
          region: currentWeather.location.region,
          country: currentWeather.location.country,
          fullName: currentWeather.location.name
        },
        forecast: forecast.forecast?.forecastday.map((day: any) => ({
          date: day.date,
          maxtemp: day.day.maxtemp_c,
          mintemp: day.day.mintemp_c,
          condition: day.day.condition.text,
          humidity: day.day.avghumidity,
          uv: day.day.uv,
          rain: day.day.daily_will_it_rain,
          rain_chance: day.day.daily_chance_of_rain
        })) || [],
        alerts: (forecast.alerts && forecast.alerts.alert) || []
      }
    });

  } catch (error) {
    console.error('Weather API fetch error:', error);
    return errorResponse('获取天气信息失败', 500);
  }
}

// 翻译位置名称到中文 (移植自旧项目)
function translateLocationName(name: string): string {
  if (!name) return name;
  if (/[\u4e00-\u9fa5]/.test(name)) {
    const cityMatch = name.match(/(北京市|上海市|天津市|重庆市|[\u4e00-\u9fa5]{2,}市)/);
    return cityMatch ? cityMatch[1] : name;
  }
  
  const locationNameMap: Record<string, string> = {
    'Beijing': '北京', 'Shanghai': '上海', 'Guangzhou': '广州', 'Shenzhen': '深圳',
    'Hangzhou': '杭州', 'Nanjing': '南京', 'Wuhan': '武汉', 'Chengdu': '成都'
    // ... 可根据需要扩展
  };

  return locationNameMap[name] || name;
}
