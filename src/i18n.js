// UI translations shared by the main process (require) and the renderer (<script>).
(function (root) {
  const DEFAULT_LANGUAGE = 'zh-CN';

  const LANGUAGES = [
    { code: 'zh-CN', name: '简体中文', locale: 'zh-CN' },
    { code: 'en', name: 'English', locale: 'en-US' }
  ];

  const messages = {
    'zh-CN': {
      'app.refresh': '刷新',
      'app.settings': '设置',
      'app.back': '返回',
      'app.minimize': '最小化',
      'app.close': '关闭',

      'balance.caption': '▣ 账户余额',
      'balance.querying': '查询中',
      'balance.queryingLong': '查询中...',
      'balance.unavailable': '不可用',
      'balance.failed': '查询失败',
      'balance.notConfigured': '未配置',
      'balance.available': '可用',
      'balance.insufficient': '余额不足',
      'balance.queryError': '余额查询失败',
      'cost.today': '☀ 当日消耗',
      'cost.month': '▦ 本月消费',

      'usage.cacheHit': '缓存命中 {rate}',
      'usage.noData': '暂无数据',
      'usage.queryFailed': '用量查询失败',
      'usage.refreshFailed': '数据刷新失败',
      'usage.querying': '正在查询用量...',
      'usage.tokenNotConfigured': '未配置用量 Token',
      'usage.tokenExpired': '用量 Token 无效或已过期，请重新同步',
      'usage.rateLimited': '请求过于频繁，请稍后再试',
      'usage.httpError': '用量接口错误：HTTP {status}',
      'lastUpdate': '最后更新：{time}',

      'chart.trend': '▥ 最近 7 天 Token 趋势',
      'chart.daily': '▥ 按日 Token 消耗',
      'chart.hit': '命中',
      'chart.miss': '未命中',
      'chart.out': '输出',
      'chart.cost': '消费金额',
      'chart.meta': '命中率 {rate} · 合计 {total}',
      'chart.tipHit': '输入（命中缓存）',
      'chart.tipMiss': '输入（未命中缓存）',
      'detail.requests': 'API 请求次数',

      'state.configured': '已配置',
      'state.notConfigured': '未配置',

      'settings.language.title': '🌐 语言',
      'settings.accounts.title': '👤 账户管理',
      'settings.accounts.desc': '支持多个 DeepSeek 账户，数据获取始终针对当前选中的账户。',
      'settings.accounts.delete': '删除',
      'settings.accounts.deleteTitle': '删除当前账户',
      'settings.accounts.keepOne': '至少保留一个账户',
      'settings.accounts.newPlaceholder': '新账户名称',
      'settings.accounts.add': '添加账户',
      'settings.accounts.enterName': '请输入账户名称',
      'settings.accounts.addFailed': '添加失败',
      'settings.accounts.added': '已添加并切换到新账户',
      'settings.accounts.confirmDelete': '确定删除账户「{name}」？其 API Key 与用量 Token 将一并清除。',
      'settings.accounts.deleteFailed': '删除失败',
      'settings.accounts.deleted': '账户已删除',

      'settings.apiKey.desc': '用于调用 DeepSeek 官方余额接口。',
      'settings.apiKey.save': '验证并保存',
      'settings.apiKey.clear': '清除 Key',
      'settings.apiKey.placeholderSet': '已配置，输入新 Key 可覆盖',
      'settings.apiKey.verifying': '正在验证...',
      'settings.apiKey.verifyFailed': '验证失败：{error}',
      'settings.apiKey.saved': '验证通过，已保存',
      'settings.apiKey.cleared': '已清除 API Key',

      'settings.token.title': '▥ 用量同步 Token',
      'settings.token.desc': '用于读取 DeepSeek 平台用量数据，包括消费、请求数、缓存命中、缓存未命中和输出 Token。',
      'settings.token.sync': '网页登录检测',
      'settings.token.clear': '清除 Token',
      'settings.token.hint': '自动同步会打开 DeepSeek 登录窗口，登录后自动保存用量 Token。',
      'settings.token.manualToggle': '方式二：手动粘贴 Token',
      'settings.token.manualHint': '如果网页登录检测不到，可从 DeepSeek 网页会话中复制 Bearer token 粘贴到这里。',
      'settings.token.save': '保存 Token',
      'settings.token.opening': '正在打开登录窗口并检测登录状态...',
      'settings.token.waiting': '登录后会自动检测 Token；如果已经登录，请等待页面加载完成。',
      'settings.token.openFailed': '打开登录窗口失败',
      'settings.token.cleared': '已清除用量 Token',
      'settings.token.verifying': '正在验证用量 Token...',
      'settings.token.saveFailed': '保存失败：{error}',
      'settings.token.invalid': 'Token 无效',
      'settings.token.saved': '已保存，正在刷新用量数据...',
      'settings.token.captured': '已检测到登录状态并保存 Token',
      'settings.token.syncEnded': '登录窗口已关闭，未检测到 Token，可手动保存 Token。',

      'settings.autoLaunch.title': '⏻ 开机自启',
      'settings.autoLaunch.label': '登录 Windows 时自动启动',

      'settings.onTop.title': '📌 窗口置顶',
      'settings.onTop.desc': '应用始终驻留系统托盘，不显示任务栏/Dock 图标；开启置顶后窗口悬浮于其他应用之上。',
      'settings.onTop.enable': '启用窗口置顶',
      'settings.onTop.hoverLabel': '鼠标悬停在窗口上时：',
      'settings.onTop.opacity': '半透明透明度',
      'settings.onTop.hint': '鼠标移开后自动恢复为不透明；悬停期间窗口可点击穿透，不遮挡桌面操作。',
      'onTop.none': '保持原样',
      'onTop.hide': '自动隐藏',
      'onTop.fade': '半透明',

      'settings.refresh.title': '↻ 自动刷新',
      'settings.refresh.enable': '启用自动刷新',
      'refresh.1m': '1 分钟',
      'refresh.5m': '5 分钟',
      'refresh.30m': '30 分钟',
      'refresh.1h': '1 小时',

      'settings.budget.title': '💡 余额预警',
      'settings.budget.desc': '余额低于阈值时发送系统通知（同一账户只提醒一次，直到余额回升）。',
      'settings.budget.enable': '启用余额预警',
      'settings.budget.save': '保存阈值',
      'settings.budget.enabled': '预警已启用',
      'settings.budget.disabled': '预警已关闭',
      'settings.budget.invalid': '请输入有效的阈值',
      'settings.budget.saveFailed': '保存失败',
      'settings.budget.saved': '阈值已保存',

      'settings.update.title': '⬆ 软件更新',
      'settings.update.hint': '检查更新后如有新版本将自动下载。',
      'settings.update.check': '检查更新',
      'settings.update.install': '重启并安装',
      'settings.update.checking': '正在检查更新...',
      'settings.about.title': 'ℹ 关于',

      'update.available': '发现新版本，正在下载...',
      'update.notAvailable': '已是最新版本',
      'update.downloading': '正在下载更新...',
      'update.downloaded': '新版本已下载，重启后生效',
      'update.error': '更新失败：{error}',
      'update.notifyTitle': 'DeepSeek Monitor 更新',
      'update.notifyBody': '新版本已下载，重启应用即可完成更新',
      'update.devMode': '开发模式不支持自动更新，请使用安装版',
      'update.checkFailed': '检查更新失败',

      'tray.show': '显示主窗口',
      'tray.onTop': '窗口置顶',
      'tray.hoverBehavior': '置顶后鼠标悬停',
      'tray.quit': '退出',

      'alert.title': '余额预警',
      'alert.body': '账户「{name}」余额 ¥{balance} 已低于阈值 ¥{threshold}',

      'account.default': '默认账户',
      'login.windowTitle': 'DeepSeek 账号登录',

      'err.business': '业务错误：{code}',
      'err.noLoginUrl': 'DeepSeek 未配置官网入口',
      'err.noBalanceApi': 'DeepSeek 未配置余额接口',
      'err.apiKeyNotConfigured': '未配置 API Key',
      'err.accountNameEmpty': '账户名称不能为空',
      'err.accountNotFound': '账户不存在',
      'err.tokenEmpty': '用量 Token 不能为空',
      'err.tokenInvalid': '用量 Token 无效或已过期，请重新获取'
    },

    en: {
      'app.refresh': 'Refresh',
      'app.settings': 'Settings',
      'app.back': 'Back',
      'app.minimize': 'Minimize',
      'app.close': 'Close',

      'balance.caption': '▣ Account balance',
      'balance.querying': 'Loading',
      'balance.queryingLong': 'Loading...',
      'balance.unavailable': 'Unavailable',
      'balance.failed': 'Query failed',
      'balance.notConfigured': 'Not configured',
      'balance.available': 'Available',
      'balance.insufficient': 'Insufficient',
      'balance.queryError': 'Failed to fetch balance',
      'cost.today': '☀ Today',
      'cost.month': '▦ This month',

      'usage.cacheHit': 'Cache hit {rate}',
      'usage.noData': 'No data',
      'usage.queryFailed': 'Failed to fetch usage',
      'usage.refreshFailed': 'Failed to refresh data',
      'usage.querying': 'Loading usage...',
      'usage.tokenNotConfigured': 'Usage token not configured',
      'usage.tokenExpired': 'Usage token is invalid or expired, please sync again',
      'usage.rateLimited': 'Too many requests, please try again later',
      'usage.httpError': 'Usage API error: HTTP {status}',
      'lastUpdate': 'Last updated: {time}',

      'chart.trend': '▥ 7-day token trend',
      'chart.daily': '▥ Daily token usage',
      'chart.hit': 'Hit',
      'chart.miss': 'Miss',
      'chart.out': 'Output',
      'chart.cost': 'Spend',
      'chart.meta': 'Hit rate {rate} · Total {total}',
      'chart.tipHit': 'Input (cache hit)',
      'chart.tipMiss': 'Input (cache miss)',
      'detail.requests': 'API requests',

      'state.configured': 'Configured',
      'state.notConfigured': 'Not configured',

      'settings.language.title': '🌐 Language',
      'settings.accounts.title': '👤 Accounts',
      'settings.accounts.desc': 'Multiple DeepSeek accounts are supported. Data is always fetched for the selected account.',
      'settings.accounts.delete': 'Delete',
      'settings.accounts.deleteTitle': 'Delete current account',
      'settings.accounts.keepOne': 'At least one account is required',
      'settings.accounts.newPlaceholder': 'New account name',
      'settings.accounts.add': 'Add account',
      'settings.accounts.enterName': 'Please enter an account name',
      'settings.accounts.addFailed': 'Failed to add account',
      'settings.accounts.added': 'Account added and selected',
      'settings.accounts.confirmDelete': 'Delete account "{name}"? Its API key and usage token will be removed as well.',
      'settings.accounts.deleteFailed': 'Failed to delete account',
      'settings.accounts.deleted': 'Account deleted',

      'settings.apiKey.desc': 'Used to call the official DeepSeek balance API.',
      'settings.apiKey.save': 'Verify & save',
      'settings.apiKey.clear': 'Clear key',
      'settings.apiKey.placeholderSet': 'Configured, enter a new key to replace it',
      'settings.apiKey.verifying': 'Verifying...',
      'settings.apiKey.verifyFailed': 'Verification failed: {error}',
      'settings.apiKey.saved': 'Verified and saved',
      'settings.apiKey.cleared': 'API key cleared',

      'settings.token.title': '▥ Usage sync token',
      'settings.token.desc': 'Used to read DeepSeek platform usage data: spend, request count, cache hits, cache misses and output tokens.',
      'settings.token.sync': 'Detect via web login',
      'settings.token.clear': 'Clear token',
      'settings.token.hint': 'Auto sync opens a DeepSeek login window and saves the usage token once you sign in.',
      'settings.token.manualToggle': 'Option 2: paste token manually',
      'settings.token.manualHint': 'If web login detection fails, copy the Bearer token from your DeepSeek web session and paste it here.',
      'settings.token.save': 'Save token',
      'settings.token.opening': 'Opening the login window and checking sign-in status...',
      'settings.token.waiting': 'The token is detected automatically after sign-in. If you are already signed in, wait for the page to finish loading.',
      'settings.token.openFailed': 'Failed to open the login window',
      'settings.token.cleared': 'Usage token cleared',
      'settings.token.verifying': 'Verifying usage token...',
      'settings.token.saveFailed': 'Save failed: {error}',
      'settings.token.invalid': 'Invalid token',
      'settings.token.saved': 'Saved, refreshing usage data...',
      'settings.token.captured': 'Sign-in detected, token saved',
      'settings.token.syncEnded': 'Login window closed without detecting a token. You can save the token manually.',

      'settings.autoLaunch.title': '⏻ Launch at startup',
      'settings.autoLaunch.label': 'Start automatically when you log in',

      'settings.onTop.title': '📌 Always on top',
      'settings.onTop.desc': 'The app always stays in the system tray without a taskbar/Dock icon. With always on top enabled, the window floats above other apps.',
      'settings.onTop.enable': 'Keep window on top',
      'settings.onTop.hoverLabel': 'When the mouse hovers over the window:',
      'settings.onTop.opacity': 'Translucent opacity',
      'settings.onTop.hint': 'The window becomes opaque again once the mouse leaves. While hovering, clicks pass through so it never blocks your desktop.',
      'onTop.none': 'Do nothing',
      'onTop.hide': 'Auto-hide',
      'onTop.fade': 'Translucent',

      'settings.refresh.title': '↻ Auto refresh',
      'settings.refresh.enable': 'Enable auto refresh',
      'refresh.1m': '1 min',
      'refresh.5m': '5 min',
      'refresh.30m': '30 min',
      'refresh.1h': '1 hour',

      'settings.budget.title': '💡 Low balance alert',
      'settings.budget.desc': 'Sends a system notification when the balance drops below the threshold (once per account until the balance recovers).',
      'settings.budget.enable': 'Enable low balance alert',
      'settings.budget.save': 'Save threshold',
      'settings.budget.enabled': 'Alert enabled',
      'settings.budget.disabled': 'Alert disabled',
      'settings.budget.invalid': 'Please enter a valid threshold',
      'settings.budget.saveFailed': 'Save failed',
      'settings.budget.saved': 'Threshold saved',

      'settings.update.title': '⬆ Updates',
      'settings.update.hint': 'New versions are downloaded automatically after checking for updates.',
      'settings.update.check': 'Check for updates',
      'settings.update.install': 'Restart & install',
      'settings.update.checking': 'Checking for updates...',
      'settings.about.title': 'ℹ About',

      'update.available': 'New version found, downloading...',
      'update.notAvailable': 'You are on the latest version',
      'update.downloading': 'Downloading update...',
      'update.downloaded': 'New version downloaded, it will apply after restart',
      'update.error': 'Update failed: {error}',
      'update.notifyTitle': 'DeepSeek Monitor update',
      'update.notifyBody': 'A new version has been downloaded. Restart the app to finish updating.',
      'update.devMode': 'Auto update is not supported in development mode, please use an installed build',
      'update.checkFailed': 'Failed to check for updates',

      'tray.show': 'Show window',
      'tray.onTop': 'Always on top',
      'tray.hoverBehavior': 'On hover while on top',
      'tray.quit': 'Quit',

      'alert.title': 'Low balance alert',
      'alert.body': 'Account "{name}" balance ¥{balance} is below the threshold ¥{threshold}',

      'account.default': 'Default account',
      'login.windowTitle': 'DeepSeek sign-in',

      'err.business': 'Business error: {code}',
      'err.noLoginUrl': 'DeepSeek login URL is not configured',
      'err.noBalanceApi': 'DeepSeek balance API is not configured',
      'err.apiKeyNotConfigured': 'API key not configured',
      'err.accountNameEmpty': 'Account name cannot be empty',
      'err.accountNotFound': 'Account not found',
      'err.tokenEmpty': 'Usage token cannot be empty',
      'err.tokenInvalid': 'Usage token is invalid or expired, please get a new one'
    }
  };

  function normalizeLanguage(lang) {
    return LANGUAGES.some((item) => item.code === lang) ? lang : DEFAULT_LANGUAGE;
  }

  function localeOf(lang) {
    return LANGUAGES.find((item) => item.code === normalizeLanguage(lang)).locale;
  }

  function translate(lang, key, params) {
    const table = messages[normalizeLanguage(lang)];
    const template = table[key] ?? messages[DEFAULT_LANGUAGE][key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] !== undefined ? String(params[name]) : match));
  }

  const api = { DEFAULT_LANGUAGE, LANGUAGES, messages, normalizeLanguage, localeOf, translate };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.I18N = api;
  }
})(this);
