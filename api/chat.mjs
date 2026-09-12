// 平陆运河 AI 问答中转（Vercel Serverless Function · Node Runtime 标准写法）
// 部署后访问路径：/api/chat
// 环境变量：DEEPSEEK_API_KEY（Vercel → Settings → Environment Variables 配置）

const SYSTEM_PROMPT = `你是"平陆运河 AI 科普助手"，面向普通公众介绍平陆运河工程。

【你的角色】
- 语气亲切、专业、通俗易懂，像一位耐心的科普讲解员。
- 回答尽量简洁，一般不超过 200 字，除非用户明确要求详细。
- 用中文回答，可适度使用列表、分段提升可读性。

【平陆运河核心知识】（回答务必以此为准，不要编造数据）

一、工程概况
- 平陆运河：新中国成立以来建设的第一条江海联运大运河，西部陆海新通道骨干工程。
- 全长约 134.2 公里，按内河Ⅰ级航道标准建设。
- 设计年单向通过能力约 8900 万吨，可通航 5000 吨级船舶。
- 起点：南宁横州市西津库区平塘江口；终点：钦州市钦南区，经钦江入北部湾。
- 工程概算总投资约 727 亿元，工期约 5 年（2022 年 8 月开工）。

二、五大航段（自上游至下游）
1. 沙坪河段：约 21 公里。
2. 分水岭段：约 29.5 公里，是全线最大土石方开挖段。
3. 钦江干流段：约 48.5 公里。
4. 钦江城区段：约 21.46 公里。
5. 入海口近海段：约 14 公里。

三、三大梯级枢纽（自上游至下游）
1. 马道枢纽：最大运行水头 29.6 米，双线 5000 吨级船闸，采用三级省水池，省水率约 60%，号称"水上电梯"。
2. 企石枢纽：最大运行水头约 27 米，双线 5000 吨级船闸，同样采用三级省水池。
3. 青年枢纽：最大运行水头 10.32 米，采用双线互灌互泄型式，可节约约一半船闸运行用水；设 480 米以上生态鱼道，是入海前最后一级。

四、技术指标
- 航道设计水深 6.3 米，入海口近海段 6.5 米。
- 航宽：起点 80 米，逐渐加宽至入海口 130 米。
- 船闸主体混凝土浇筑量约 584.6 万立方米。
- 全线内河航程比绕行珠江口缩短约 560 公里。
- 综合物流成本预计降低 18%—30%。

五、建设历程
- 2022 年 8 月 28 日：平陆运河正式开工建设。
- 2023 年：进入全面建设阶段。
- 规划于 2026 年底建成通航（以官方最新通报为准）。

六、战略意义
- 开辟珠江—西江第二条入海航道，纵向贯通西江航运干线与北部湾国际枢纽海港。
- 让广西由"向东出海"变为"向海图强"，缩短西南地区出海距离。
- 是西部陆海新通道的骨干工程，推动沿线县区经济发展。

七、沿线县区（直接经过）
- 横州市、灵山县、钦北区、钦南区。

【回答原则】
- 优先使用上述知识回答；若问题超出上述范围，可基于常识合理回答并说明"以官方公布为准"。
- 若用户问的是工程数据（水头、里程、投资等），务必引用上述准确数字。
- 不要承认自己是某个特定公司或机构的官方代表，只以科普助手身份回答。`;

const ALLOWED_ORIGINS = [
  'https://xiaojianglai.github.io',
  'http://localhost:8899',
  'http://localhost:8900',
  'http://127.0.0.1:8899',
];

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(res, obj, status, origin) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    res.setHeader(k, v);
  }
  res.end(JSON.stringify(obj));
}

// Vercel Node.js 函数标准签名：export default function handler(req, res)
export default async function handler(req, res) {
  const origin = req.headers['origin'] || '';

  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    for (const [k, v] of Object.entries(corsHeaders(origin))) {
      res.setHeader(k, v);
    }
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return json(res, { error: '仅支持 POST 请求' }, 405, origin);
  }

  // 读取请求体（Vercel Node 函数的 req 默认是流式，需要手动收集）
  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk;
    }
  } catch (e) {
    return json(res, { error: '读取请求体失败' }, 400, origin);
  }

  let payload;
  try {
    payload = JSON.parse(body || '{}');
  } catch (e) {
    return json(res, { error: '请求体必须是 JSON' }, 400, origin);
  }

  const message = (payload.message || '').trim();
  if (!message) {
    return json(res, { error: '缺少 message 字段' }, 400, origin);
  }

  const history = Array.isArray(payload.history) ? payload.history : [];

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return json(res, { error: '服务端未配置 DEEPSEEK_API_KEY，请在 Vercel 环境变量中设置' }, 500, origin);
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.filter((m) => m && (m.role === 'user' || m.role === 'assistant')).slice(-10),
    { role: 'user', content: message },
  ];

  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.7,
        max_tokens: 800,
        stream: false,
      }),
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      let errMsg = '上游接口错误 ' + upstream.status;
      try {
        const j = JSON.parse(text);
        errMsg = j.error?.message || j.error?.type || errMsg;
      } catch (e) {}
      return json(res, { error: errMsg }, 502, origin);
    }

    let answer = '';
    try {
      const j = JSON.parse(text);
      answer = j.choices?.[0]?.message?.content || '';
    } catch (e) {
      return json(res, { error: '上游返回格式异常' }, 502, origin);
    }

    if (!answer) {
      return json(res, { error: '上游未返回有效内容' }, 502, origin);
    }

    return json(res, { answer }, 200, origin);
  } catch (e) {
    return json(res, { error: '调用失败：' + (e.message || String(e)) }, 500, origin);
  }
}
