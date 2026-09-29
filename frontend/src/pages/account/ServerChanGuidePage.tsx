import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

const steps = [
  {
    title: '打开绑定入口',
    description: '在“个人中心 → 微信通知”中点击“前往 Server 酱绑定”。',
    image: '/images/serverchan/01-open-binding.png',
    alt: '微信通知设置页面，箭头指向“前往 Server 酱绑定”按钮',
  },
  {
    title: '扫码登录 Server 酱',
    description: '用微信扫描实际打开的 Server 酱页面上的二维码，再点击“扫码后点此继续”。图片中的二维码仅供说明。',
    image: '/images/serverchan/02-scan-login.png',
    alt: 'Server 酱微信扫码登录页面，二维码下方有“扫码后点此继续”按钮',
  },
  {
    title: '生成 AppKey',
    description: '跳转到生成 AppKey 的页面后，按提示点击“生成”。通常无需修改预填的应用备注。',
    image: '/images/serverchan/03-create-appkey.png',
    alt: 'Server 酱生成 AppKey 的弹窗，应用备注已填写 vps-monitor，下方有“生成”按钮',
  },
  {
    title: '复制 Key 并返回本站',
    description: '点击“复制Key，然后返回vps-monitor”。返回后等待保存完成，确认显示“已绑定”，点击“发送测试通知”并检查微信，最后开启微信通知。',
    image: '/images/serverchan/04-return-to-site.png',
    alt: 'Server 酱 AppKey 创建完成页面，箭头指向“复制Key，然后返回vps-monitor”按钮',
  },
];

export const ServerChanGuidePage: React.FC = () => (
  <div className="max-w-4xl mx-auto space-y-6">
    <div>
      <Link to="/account/notifications" className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 mb-3">
        <ArrowLeft className="w-3.5 h-3.5 mr-1" />返回微信通知
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">如何绑定 Server 酱 Key</h1>
      <p className="text-sm text-gray-500 mt-2 leading-6">绑定后，你可以开启收藏 VPS 的微信库存通知。</p>
    </div>

    <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-xs space-y-5" aria-labelledby="automatic-binding">
      <div>
        <h2 id="automatic-binding" className="text-lg font-bold text-gray-900">推荐：从本站跳转绑定</h2>
        <p className="text-sm text-gray-500 mt-1">整个过程会从本站跳转到 Server 酱，再返回本站保存 Key。</p>
      </div>
      <ol className="space-y-5">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{index + 1}</span>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-gray-600">{step.description}</p>
              </div>
            </div>
            <figure className="mt-4">
              <img src={step.image} alt={step.alt} loading="lazy" className="mx-auto h-auto max-h-[720px] max-w-full rounded-lg border border-gray-200 bg-white object-contain" />
              {index === 3 && <figcaption className="mt-2 text-center text-xs text-gray-500">截图中的 localhost 是演示地址，实际回跳地址以你访问的站点为准。</figcaption>}
            </figure>
          </li>
        ))}
      </ol>
      <Link to="/account/notifications" className="inline-flex items-center text-sm font-semibold text-brand-700 hover:text-brand-800">
        前往微信通知设置 <ArrowRight className="ml-1 h-4 w-4" />
      </Link>
    </section>

    <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-xs space-y-4" aria-labelledby="manual-binding">
      <div>
        <h2 id="manual-binding" className="text-lg font-bold text-gray-900">备选：手动填写 Key</h2>
        <p className="text-sm text-gray-500 mt-1">如果跳转绑定未完成，也可以手动填写从 Server 酱获得的 Key。</p>
      </div>
      <ol className="list-decimal pl-5 space-y-2 text-sm leading-6 text-gray-700">
        <li>在 Server 酱页面获取你自己的 SendKey。</li>
        <li>返回“微信通知”，点击“手动填写 Key”，粘贴 Key 并保存。</li>
        <li>确认显示“已绑定”后，点击“发送测试通知”并检查微信，再开启微信通知。</li>
      </ol>
    </section>

    <aside className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
      <p>Key 属于私密凭证，请不要在截图、聊天或公开页面中展示。保存 Key 后可以发送测试通知并在微信确认收到；库存通知仍需手动开启。</p>
    </aside>
  </div>
);
