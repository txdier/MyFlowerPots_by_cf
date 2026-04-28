# 消息中心与通知规则

这份文档面向项目维护者和后续开发者，用来说明当前哪些动作会往“消息中心”写消息，以及哪些动作只会改消息状态、写客服收件箱，或完全不会生成站内消息。

## 边界

- “消息中心”对应 D1 `messages` 表和 `/api/messages*` 接口，前端入口在首页头像菜单里的消息中心弹窗。
- “客服收件箱”对应 `support_emails` / `support_email_replies` 和 `/api/admin/support/*`，它不进入消息中心列表。
- 两者当前只共用头像上的未读徽标总数：`notificationBadgeCount = unreadCount + supportUnreadCount`。

## 触发矩阵

| 动作 | 入口 API / 业务流程 | 接收人 | `type` | 初始状态 | 前端消息中心显示 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| 发送花盆留言 | `POST /api/messages/pot-comment` | 花盆主人、其他协作者、其他 viewer | `pot_comment` | `unread` | 是 | 发送者自己还会写 1 条 `selfCopy: true` 的已读副本，但前端会过滤掉 |
| 回复花盆留言 | `POST /api/messages/pot-comment-reply` | 花盆主人、其他协作者、其他 viewer | `pot_comment` | `unread` | 是 | 只允许回复顶层留言；回复通知仍走同一套接收人规则 |
| 单盆共同照料邀请 | `POST /api/collaborators/:potId` | 被邀请用户 | `collab_invite` | `unread` | 是 | 成功后对方已直接成为协作者，不是“等待站内接受”的消息 |
| 批量邮箱共同照料邀请 | 首页批量邀请 `email` 方式，循环调用 `addCollaborator` | 被邀请用户 | `collab_invite` | `unread` | 是 | 每个成功加入的花盆各写 1 条，当前不会自动聚合 |
| 共同照料邀请链接被接受 | `POST /api/collaborators/accept/:token` | 花盆主人 | `system_info` | `unread` | 是 | 仅首次实际加入时发送；已是协作者/主人时不会新增 |
| 主人移除协作者 | `DELETE /api/collaborators/:potId/:userId` | 被移除协作者 | `system_info` | `unread` | 是 | 消息先写入，再删除协作关系 |
| 协作者主动退出 | `DELETE /api/collaborators/:potId` | 花盆主人 | `system_info` | `unread` | 是 | 提示主人成员已离开 |
| 单盆查看邀请 | `POST /api/viewers/:potId` | 被邀请用户 | `system_info` | `unread` | 是 | 成功后对方已直接获得 viewer 权限 |
| 批量邮箱查看邀请 | 首页批量邀请 `email` 方式，循环调用 `addViewer` | 被邀请用户 | `system_info` | `unread` | 是 | 每个成功加入的花盆各写 1 条，当前不会自动聚合 |
| 查看邀请链接被接受 | `POST /api/viewers/accept/:token` | 花盆主人 | `system_info` | `unread` | 是 | 仅首次实际获得查看权限时发送 |
| 主人取消查看权限 | `DELETE /api/viewers/:potId/:userId` | 被移除 viewer | `system_info` | `unread` | 是 | 对方会收到“查看权限已取消” |
| Viewer 主动从列表移除 | `DELETE /api/viewers/:potId` | 花盆主人 | `system_info` | `unread` | 是 | 提示主人好友已移除该花盆 |
| 批量链接邀请被接受 | `POST /api/batch-invites/accept/:token` | 邀请发起人（花盆主人） | `system_info` | `unread` | 是 | 只在实际新增权限或把 viewer 升级为 collaborator 时发送 |
| 主人归档仍有协作者的花盆 | 归档流程 `sealArchivedPotAccess(...)` | 所有原协作者 | `system_info` | `unread` | 是 | 协作者会被转成只读 viewer，并收到权限调整通知 |
| 发起花盆移交请求 | `POST /api/transfer/:potId` | 目标邮箱对应的已注册用户 | `transfer_request` | `unread` | 是 | 只有目标邮箱已存在站内账号时才写站内消息；未注册时只发邮件 |
| 移交请求被拒绝 | `POST /api/transfer/reject/:token` | 原主人 | `system_info` | `unread` | 是 | 同时会把接收方已有 `transfer_request` 改成 `processed` |

## 状态流转

- `unread`：默认未读状态。除少数显式指定外，绝大多数新增消息都会落在这个状态。
- `read`：用户在消息中心点击单条“标记已读”后进入该状态；`read-all` 也会批量写成 `read`。
- `processed`：当前主要用于移交流程，表示这条请求消息已经被接受、拒绝或取消，不再等待处理。

## 特殊可见性与实现细节

- `pot_comment` 会给发送者本人写一条 `selfCopy: true` 的已读副本，便于统一复用通知写入逻辑；前端 `fetchMessages()` 会把这类记录过滤掉。
- 前端消息中心当前只明确映射了 4 类图标：`transfer_request`、`collab_invite`、`pot_comment`、`system_info`。新增消息类型时要同步更新首页消息中心的图标和交互映射。
- 当前消息中心展示的是 `/api/messages` 的直接结果，按 `created_at DESC` 取最近 100 条，没有服务端分组或聚合。

## 容易混淆的差异

- 批量邀请分成两套：
  - `email` 方式本质上是循环调用单盆邀请接口，所以对方会按花盆条数收到多条站内消息。
  - `link` 方式在“创建链接”时不会给接收方写任何消息，只有对方真正接受后，才会给主人写一条摘要通知。
- 当前前端“批量邀请”里的邮箱文案容易让人误以为“链接方式创建时对方也会立刻在消息中心看到”，代码现状并不是这样。若以后调整 UI 文案，应按这个规则改。
- 移交流程里：
  - 发起移交会新增 `transfer_request`
  - 取消移交不会新增消息，只会把已有请求改成 `processed`
  - 接受移交不会新增消息，只会把已有请求改成 `processed`
  - 拒绝移交会给主人新增 1 条 `system_info`

## 当前已知边界 / 例外

- 删除 `pot_comment` 或回复时，当前只删除 `pot_comments` 记录，不会回收已经发出的 `messages` 通知。
- 批量链接邀请创建成功时，不会给接收方写消息。
- 公开分享访客不参与当前留言通知链路；留言通知只面向登录后的 owner / collaborator / viewer。
- 目前大量业务都复用 `system_info`，语义已经偏宽；如果后续要做筛选、静默策略或埋点统计，建议逐步拆分更细的消息类型。

## 维护检查清单

- 新增消息类型时，同步更新首页消息中心的图标映射、按钮交互和本文档的触发矩阵。
- 新增任何 `INSERT INTO messages` 写入点时，同步检查接收人、默认状态和是否应出现在前端消息中心。
- 修改邀请、评论或权限规则时，同步检查：
  - 接收人是否仍然正确
  - `unread` 计数是否仍然符合预期
  - 是否需要补充或收敛重复通知
- 如果后续继续优化，优先把分散在 `collaborators.ts`、`viewers.ts`、`batch-invites.ts`、`transfer.ts`、`messages.ts`、`pots.ts` 里的消息创建逻辑收敛到共享 helper / service。
- 对于消息噪音，如果要做第一批优化，优先考虑：
  - 同一邮箱的批量邮箱邀请按一次操作聚合成摘要消息
  - 同一花盆短时间内的权限变更通知做去重或摘要
- 关于“删除留言后是否同步清理历史通知”，当前实现是保留历史通知；如产品规则改变，需要同时更新代码和本文档。
