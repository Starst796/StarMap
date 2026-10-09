# 穹顶 · 实时星图

一个可直接作为静态页面打开的交互星图。天体星历在浏览器端计算，时间、经纬度和方位设置不会发送到应用服务器。

## 功能

- **一次性载入约 5000 颗恒星与 110 个梅西耶深空天体**（数据编译进 `catalog.js`，除星历库外无需联网请求）。
- **时间机器**：时间连续自动推进，可暂停 / 播放、加速减速（1× 至 1 天/秒）、反向倒放，或一键同步到当前实时。
- **仰视视角**：星图按「抬头望天」的方向绘制，东方在左、西方在右，符合地平坐标系下的直观印象。
- **天体位置分栏**：太阳系 / 深空 / 恒星三个分页，支持名称搜索（中文名、西名、梅西耶编号），点击任一行即旋转星图定位该天体。
- **星图内不显示名称**：天体会以点/符号呈现，点击画布上的天体即在右下角弹出详情卡（方位、高度、视星等、赤道坐标）。点击画布不会滚动或跳转天体列表；触摸设备的点选容差会自动放宽，所有已绘制的恒星都可点选。
- **黄道面与银道面**：默认叠加黄道（珊瑚色长虚线）与银道（浅蓝点线）两条大圆参考线，按地平线裁剪，可在星图下方图例处随时开关。黄道线始终穿过太阳位置，银道线为银河中心线。
- **显示限星等滑块**：拖动即可只显示亮于指定星等的恒星与深空天体（范围 −1.5 ~ 12 等，覆盖全部 5044 颗恒星与 110 个梅西耶天体），快速降低星图密度；搜索不受限制，仍可找到任意暗星。深空列表按星等由亮到暗排列。
- **天顶 / 自由两种视角**：默认「天顶模式」以天顶为视场中心、拖动只改变朝向（东方在左的仰视镜像）。切到「自由模式」后视场中心可随拖动在地平坐标系内自由移动——天顶在上、地平线在下，接近真实抬头所见；地平线以下也会一并绘制（地面底色、负高度网格与天底标记，天体以下方暗显），设备支持时陀螺仪会同时同步方位与俯仰，点击天体列表项会把视野直接移到该天体。

## 静态使用

直接打开 `index.html` 即可。天体星历通过 Astronomy Engine 2.1.19 的 jsDelivr 浏览器构建加载，因此首次使用星历需要网络连接；星历加载失败时，时间/地点控制仍可用，但天体位置不会显示。

支持天顶/自由两种视角切换、时间播放控制、调整经纬度、同步系统当前时间、请求浏览器定位、拖动星图（天顶模式旋转朝向、自由模式移动视野）/使用方位滑杆、缩放星图（按钮或滚轮），以及在设备支持时主动开启陀螺仪方向同步。

桌面端整个页面按视口高度固定，右侧设置栏（时间、地点、方位、天体位置）自适应限高并内部滚动，调整设置不会改变星图位置；横屏或较矮的窗口会自动压缩顶栏与图例，让整幅星图保持完整显示。窄屏（≤720px）则恢复为单列纵向滚动布局。

## 可选：Flask 局域网部署

需要 Python 3.9 或更新版本。在项目目录运行：

```sh
python3 -m pip install -r requirements.txt
python3 app.py
```

服务默认监听 `0.0.0.0:8000`。同一 Wi-Fi 下的设备访问运行电脑的局域网 IP，例如 `http://192.168.1.20:8000`。可用 `python3 app.py --port 8080` 更换端口；仅本机访问时可运行 `python3 app.py --host 127.0.0.1`。

首次从手机访问时，可能需要允许 macOS 防火墙接收连接。浏览器通常只在 HTTPS 或 localhost 等安全上下文中开放定位和方向传感器；局域网 HTTP 部署时，这两项权限可能不可用，此时仍可手动设置经纬度和拖动/滑动调整方位。若需要手机传感器权限，需为局域网服务配置 HTTPS。

## 星表数据

`catalog.js` 由 `tools/build_catalog.py` 生成，数据来源为 [d3-celestial](https://github.com/ofrohn/d3-celestial) 的亮星星表（视星等 ≤ 6）与梅西耶星表，脚本内部附有中文名称对照（星座、亮星、梅西耶天体），并额外生成黄道面与银道面的大圆采样点（J2000 赤道坐标，每 2° 一个点）。

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

> 静态资源均使用 `Cache-Control: no-cache`（每次重新校验），避免发布新版本后客户端继续使用旧文件。
