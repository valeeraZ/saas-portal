const messages: Record<string, string> = {
  unauthorized: "会话已过期，请重新登录。",
  forbidden: "当前账户没有操作权限，请确认邮箱已验证且与邀请邮箱一致。",
  not_found: "邀请无效、已撤销或无法访问。",
  invalid_input: "请检查填写的信息后重试。",
  already_exists: "该名称或邀请已存在，请检查后重试。",
  service_unavailable: "服务暂时不可用，请稍后重试。",
  dependency_unavailable: "身份服务暂时不可用，请稍后重试。",
  csrf: "页面会话已变化，请刷新后重试。",
  bad_request: "请求无效，请刷新后重试。",
};
export function message(code: string) {
  return messages[code] ?? "操作未完成，请确认邀请与租户状态后重试。";
}
