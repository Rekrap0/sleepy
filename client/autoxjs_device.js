/*
autoxjs_device.js
使用 Autox.js 编写的安卓自动更新状态脚本
by wyf9. all rights reserved. (?)
Co-authored-by: NyaOH-Nahida - 新增捕捉退出事件，将退出脚本状态上报到服务器。
*/

// config start
const API_URL = 'https://status.jiangye-song.top/device/set'; // 你的完整 API 地址，以 `/device/set` 结尾
const SECRET = '20010718'; // 你的 secret
const ID = 'PrSamsungS25Ultra'; // 你的设备 id, 唯一
const SHOW_NAME = 'Jiangye的手机'; // 你的设备名称, 将显示在网页上
const CHECK_INTERVAL = '3000'; // 检查间隔 (毫秒, 1000ms=1s)
const FORCE_SEND_COUNT = 10; // 相同状态多少次后强制发送一次
// config end

auto.waitFor(); // 等待无障碍

// 替换了 secret 的日志, 同时添加前缀
function log(msg) {
    try {
        console.log(`[sleepyc] ${msg.replace(SECRET, '[REPLACED]')}`);
    } catch (e) {
        console.log(`[sleepyc] ${msg}`);
    }
}
function error(msg) {
    try {
        console.error(msg.replace(SECRET, '[REPLACED]'));
    } catch (e) {
        console.error(msg);
    }
}

var last_status = '';
var same_status_count = 0; // 相同状态计数器

function getForegroundAppFromUsageStats() {
    try {
        let usm = context.getSystemService(android.app.usage.UsageStatsManager);
        let time = Date.now();
        let stats = usm.queryUsageStats(android.app.usage.UsageStatsManager.INTERVAL_DAILY, 
                                      time - 1000 * 60 * 10, // 10分钟前
                                      time);
        
        if (!stats || stats.size() === 0) {
            console.log("没有获取到使用统计");
            return null;
        }

        let recentStats = null;
        let blacklist = ["sidegesturepad", "microsoft.appmanager", "systemui"]; // 黑名单
        
        for (let i = 0; i < stats.size(); i++) {
            let stat = stats.get(i);
            if (!stat) continue;
            
            let pkg = stat.getPackageName();
            if (!pkg) continue;
            
            // 检查是否在黑名单中
            let isBlacklisted = blacklist.some(b => pkg.includes(b));
            if (isBlacklisted) continue;
            
            if (recentStats == null || stat.getLastTimeUsed() > recentStats.getLastTimeUsed()) {
                recentStats = stat;
            }
        }

        if (recentStats != null) {
            let pkgName = recentStats.getPackageName();
            return {
                package: pkgName,
                name: app.getAppName(pkgName) || pkgName
            };
        }
    } catch (e) {
        console.error("获取使用统计出错:", e);
    }
    return null;
}


function check_status() {
    /*
    检查状态并返回 app_name (如未在使用则返回空)
    [Tip] 如有调试需要可自行取消 log 注释
    */
    // log(`[check] screen status: ${device.isScreenOn()}`);
    if (!device.isScreenOn()) {
        return ('');
    }

    let foregroundApp = getForegroundAppFromUsageStats();
    if (foregroundApp) {
        console.log("当前前台应用:", foregroundApp.name, "包名:", foregroundApp.package);
    } else {
        console.log("无法获取前台应用");
    }

    // var app_package = getForegroundAppFromUsageStats(); // 应用包名
    // log(`[check] app_package: '${app_package}'`);
    // var app_name = app.getAppName(app_package); // 应用名称
    var app_name = foregroundApp.name; // 应用名称

    if (app_name.includes("Biometrics")) {
        app_name = "锁屏界面";
    }

    if (app_name.includes("Link to Windows")) {
        app_name = "正在使用";
    }

    if (app_name.includes("System UI")) {
        app_name = "正在使用";
    }

    if (app_name.includes("Microsoft Launcher")) {
        app_name = "手机桌面";
    }

    if (app_name.includes("One UI")) {
        app_name = "手机桌面";
    }

    if (app_name.includes("One Hand Operation")) {
        app_name = "正在使用";
    }

    // log(`[check] app_name: '${app_name}'`);
    var battery = device.getBattery(); // 电池百分比
    // log(`[check] battery: ${battery}%`);
    // 判断设备充电状态
    if (device.isCharging()) {
        var retname = `⚡️${battery}% \u0001 ${app_name}`;
    } else {
        var retname = `🔋${battery}% \u0001 ${app_name}`;
    }
    if (!app_name) {
        retname = '';
    }
    return (retname);
}
function send_status() {
    /*
    发送 check_status() 的返回
    */
    var app_name = check_status();
    log(`ret app_name: '${app_name}'`);

    // 判断是否与上次相同
    if (app_name == last_status) {
        same_status_count++;
        log(`same as last status (count: ${same_status_count})`);
        
        // 如果相同状态达到设定次数，强制发送一次
        if (same_status_count >= FORCE_SEND_COUNT) {
            log(`reached force send count (${FORCE_SEND_COUNT}), sending status anyway`);
            same_status_count = 0; // 重置计数器
        } else {
            log('bypass request');
            return;
        }
    } else {
        // 状态发生变化，重置计数器
        same_status_count = 0;
        last_status = app_name;
    }
    
    // 判断 using
    if (app_name == '') {
        log('using: false');
        var using = false;
    } else {
        log('using: true');
        var using = true;
    }

    // POST to api
    log(`Status string: '${app_name}'`);
    log(`POST ${API_URL}`);
    r = http.postJson(API_URL, {
        'secret': SECRET,
        'id': ID,
        'show_name': SHOW_NAME,
        'using': using,
        'app_name': app_name
    });
    log(`response: ${r.body.string()}`);
}


// 程序退出后上报停止事件
events.on("exit", function () {
    log("Script exits, uploading using = false");
    toast("[sleepy] 脚本已停止, 上报中");
    // POST to api
    log(`POST ${API_URL}`);
    try {
        r = http.postJson(API_URL, {
            'secret': SECRET,
            'id': ID,
            'show_name': SHOW_NAME,
            'using': false,
            'app_name': '[Client Exited]' // using 为 false 时前端不会显示这个, 而是 '未在使用'
        });
        log(`response: ${r.body.string()}`);
        toast("[sleepy] 上报成功");
    } catch (e) {
        error(`Error when uploading: ${e}`);
        toast(`[sleepy] 上报失败! 请检查控制台日志`);
    }
});

while (true) {
    log('---------- Run\n');
    try {
        send_status();
    } catch (e) {
        error(`ERROR sending status: ${e}`);
    }
    sleep(CHECK_INTERVAL);
}