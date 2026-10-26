import { createFileRoute, Link } from "@tanstack/react-router";
import { clientEnv } from "@/lib/env/client.env";
import { PIANO_SHARING_TERMS_VERSION } from "@/features/piano/sharing-terms";
import "@/features/piano/piano.css";

export const Route = createFileRoute("/_public/piano-sharing-terms")({
  head: () => ({
    meta: [
      { title: "曲谱共享协议 · Yasin's Blog" },
      {
        name: "description",
        content: "非营利练琴互助网站的曲谱共享约定与权利反馈方式。",
      },
    ],
  }),
  component: SharingTermsPage,
});
function SharingTermsPage() {
  const email = clientEnv().VITE_BLOG_EMAIL || "yasingfls@outlook.com";
  return (
    <article className="piano-room piano-terms">
      <Link to="/piano" className="piano-text-button">
        ← 返回钢琴练习室
      </Link>
      <h1>曲谱共享协议</h1>
      <p className="piano-caption">
        版本 {PIANO_SHARING_TERMS_VERSION} · 每个账号确认一次
      </p>
      <p>
        这里是一个不以盈利为目的的钢琴练习与互助分享空间。我们希望大家尊重创作者，把有权分享的谱子提供给同好学习。看谱和本机练习无需登录；注册并同意本协议后，才可上传曲谱。
      </p>
      <h2>1. 分享范围与权利</h2>
      <p>
        请仅上传你有权公开分享的曲谱，例如你拥有完整相关权利的原创作品、获得权利人明确许可的作品，或依法可公开使用的版本。改编、制谱、指法标注和
        MIDI
        转录不当然取得原作的传播权；原作、编曲和具体谱本的权利均应确认。购买或下载过一份曲谱，也不等于获得向公众分享的授权。
      </p>
      <p>
        <strong>非营利、个人练习或注明来源，并不自动免除著作权义务。</strong>
        请保留作者、编曲者及许可要求的署名，不移除版权说明，不上传未经许可的付费谱、盗版内容或他人的隐私信息。无法确认分享权限时，可在本机练习，不要上传。
      </p>
      <h2>2. 上传后公开，不收取曲谱费用</h2>
      <p>
        本站所有已上传曲谱统一进入共享曲库，不提供私人云曲库。上传后立即对所有访客开放，无需审核；访客可以查看、播放、练习及保存曲谱。即时发布不代表本站已核实或认可其权利状态。本站不售卖曲谱，也不通过曲谱共享牟利。
      </p>
      <h2>3. 你授予的有限许可</h2>
      <p>
        在你有权授权的范围内，你同意本站为运行共享练习功能免费、非独占地存储、备份、转换格式、展示和传输所上传的曲谱，并允许访客用于非商业的个人学习与练习。你保留原有权利；本协议不转让著作权，不授予本站或访客转售、商业使用及超出许可范围再次传播的权利。原作品的许可条件仍应遵守。
      </p>
      <h2>4. 撤回与维护</h2>
      <p>
        你可以在共享曲库删除自己上传的曲谱，或联系站点管理员申请下架；删除后本站停止对外提供该文件，缓存或必要备份按维护周期清理，依法需要保留的记录除外。已经由访客保存的副本无法由本站远程收回。管理员可以处理侵权投诉、移除违法或明显不适合共享的内容，并对重复滥用上传功能的账号采取必要限制。
      </p>
      <h2>5. 权利反馈与申诉</h2>
      <p>
        如认为某份曲谱侵犯你的权利，请发邮件至{" "}
        <a
          href={`mailto:${email}?subject=${encodeURIComponent("钢琴曲谱权利反馈")}`}
        >
          {email}
        </a>
        ，说明权利人姓名或名称、联系方式与地址、曲谱名称和本站链接、相关权利及侵权的初步证明。仅提供处理请求所必需的信息，不要把身份证件等敏感资料发布在公开区。
      </p>
      <p>
        本站收到符合要求的通知后，将及时依法采取删除或断开链接等必要措施，并通知上传者。上传者可通过同一邮箱提交事实说明及证明材料申请复核；本站依适用法律处理通知、申诉和恢复事宜。
      </p>
      <h2>6. 练习体验与责任</h2>
      <p>
        曲谱、指法、MIDI 转谱和 AI
        练习建议可能有误，不能替代教师指导或权利人的正式版本，请结合自身水平核对使用。上传者应对提供内容和授权说明的真实性负责，本站也依法履行自身义务；各方责任依实际行为、过错和适用法律确定，本协议不排除依法不得免除的责任。
      </p>
      <h2>7. 授权记录</h2>
      <p>
        点击同意并上传时，本站记录你的账号、同意的协议版本和时间，用于确认共享授权及处理争议。同一账号以后上传无需重复勾选，后续每次上传仍应符合本协议。曲谱展示上传者昵称；邮箱不随曲谱公开。
      </p>
      <p className="piano-caption">
        相关规则：
        <a
          href="https://www.ncac.gov.cn/xxfb/flfg/flfg_532/202103/t20210309_50530.html"
          target="_blank"
          rel="noreferrer"
        >
          《中华人民共和国著作权法》
        </a>{" "}
        ·{" "}
        <a
          href="https://www.cac.gov.cn/2013-02/18/c_126468776.htm"
          target="_blank"
          rel="noreferrer"
        >
          《信息网络传播权保护条例》
        </a>
      </p>
    </article>
  );
}
