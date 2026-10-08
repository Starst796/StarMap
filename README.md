# 穹顶 · 实时星图

一个可直接作为静态页面打开的交互星图。天体星历在浏览器端计算，时间、经纬度和方位设置不会发送到应用服务器。

## 功能

- **一次性载入约 5000 颗恒星与 110 个梅西耶深空天体**（数据编译进 `catalog.js`，除星历库外无需联网请求）。
- **时间机器**：时间连续自动推进，可暂停 / 播放、加速减速（1× 至 1 天/秒）、反向倒放，或一键同步到当前实时。
- **仰视视角**：星图按「抬头望天」的方向绘制，东方在左、西方在右，符合地平坐标系下的直观印象。
- **天体位置分栏**：太阳系 / 深空 / 恒星三个分页，支持名称搜索（中文名、西名、梅西耶编号），点击任一行即旋转星图定位该天体。
- **星图内不显示名称**：天体会以点/符号呈现，点击画布上的天体即在右下角弹出详情卡（方位、高度、视星等、赤道坐标）。点击画布不会滚动或跳转天体列表；触摸设备的点选容差会自动放宽，所有已绘制的恒星都可点选。
- **显示限星等滑块**：拖动即可只显示亮于指定星等的恒星，快速降低星图密度（搜索不受限制，仍可找到任意暗星）。

## 静态使用

直接打开 `index.html` 即可。天体星历通过 Astronomy Engine 2.1.19 的 jsDelivr 浏览器构建加载，因此首次使用星历需要网络连接；星历加载失败时，时间/地点控制仍可用，但天体位置不会显示。

支持时间播放控制、调整经纬度、同步系统当前时间、请求浏览器定位、拖动星图/使用方位滑杆、缩放星图（按钮或滚轮），以及在设备支持时主动开启陀螺仪方向同步。

## 可选：Flask 局域网部署

需要 Python 3.9 或更新版本。在项目目录运行：

```sh
python3 -m pip install -r requirements.txt
python3 app.py
```

服务默认监听 `0.0.0.0:8000`。同一 Wi-Fi 下的设备访问运行电脑的局域网 IP，例如 `http://192.168.1.20:8000`。可用 `python3 app.py --port 8080` 更换端口；仅本机访问时可运行 `python3 app.py --host 127.0.0.1`。

首次从手机访问时，可能需要允许 macOS 防火墙接收连接。浏览器通常只在 HTTPS 或 localhost 等安全上下文中开放定位和方向传感器；局域网 HTTP 部署时，这两项权限可能不可用，此时仍可手动设置经纬度和拖动/滑动调整方位。若需要手机传感器权限，需为局域网服务配置 HTTPS。

## 星表数据

`catalog.js` 由 `tools/build_catalog.py` 生成，数据来源为 [d3-celestial](https://github.com/ofrohn/d3-celestial) 的亮星星表（视星等 ≤ 6）与梅西耶星表，脚本内部附有中文名称对照（星座、亮星、梅西耶天体）。

```sh
mkdir -p .cache
curl -sL -o .cache/stars6.json    https://cdn.jsdelivr.net/npm/d3-celestial@0/data/stars.6.json
curl -sL -o .cache/starnames.json https://cdn.jsdelivr.net/npm/d3-celestial@0/data/starnames.json
curl -sL -o .cache/messier.json   https://cdn.jsdelivr.net/npm/d3-celestial@0/data/messier.json
python3 tools/build_catalog.py
```

如需增减天体数量或补充中文名，修改脚本中的 `STAR_ZH` / `MESSIER_ZH` / `CON_ZH` 映射后重新运行即可。

## 部署（map.starst.site）

线上由 nginx 直接托管静态文件，站点根目录为 `/home/ubuntu/starmap`，通过 `git push` 自动发布。

- 远端裸仓库：`ssh://ubuntu@starst.site/home/ubuntu/starmap.git`
- 部署钩子：`deploy/post-receive`，安装到裸仓库的 `hooks/post-receive`，负责把 `main` 分支检出到 `/home/ubuntu/starmap`。

首次在新服务器上初始化：

```sh
# 服务器：创建裸仓库
ssh ubuntu@starst.site 'git init --bare -b main /home/ubuntu/starmap.git'

# 本地：安装钩子并推送
scp deploy/post-receive ubuntu@starst.site:/home/ubuntu/starmap.git/hooks/post-receive
ssh ubuntu@starst.site 'chmod 755 /home/ubuntu/starmap.git/hooks/post-receive'
git remote add deploy ssh://ubuntu@starst.site/home/ubuntu/starmap.git
git push deploy main
```

日常发布：

```sh
git add -A && git commit -m "..." && git push deploy main
```

推送后钩子会自动更新站点目录。nginx 站点配置存放在仓库根目录的
`map.starst.site.nginx.conf`，更新后需同步到服务器并重载：

```sh
ssh ubuntu@starst.site 'sudo cp /home/ubuntu/starmap/map.starst.site.nginx.conf /etc/nginx/sites-available/map.starst.site && sudo nginx -t && sudo systemctl reload nginx'
```
