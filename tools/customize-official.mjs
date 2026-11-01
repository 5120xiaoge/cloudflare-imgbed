import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Strict replacements for official 99eb1a29 (2.7.8), not an upstream rebuild.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'frontend-dist');
const pending = new Map();
function replace(file, before, after) {
    const filename = path.join(dist, file);
    let source = pending.get(filename) ?? fs.readFileSync(filename, 'utf8');
    if (source.includes(after) && (after.includes(before) || !source.includes(before))) return;
    if (source.split(before).length !== 2) throw new Error(`Unexpected match count: ${file}: ${before.slice(0, 100)}`);
    source = source.replace(before, after);
    pending.set(filename, source);
}
function replaceAny(file, candidates, after) {
    const filename = path.join(dist, file);
    const source = pending.get(filename) ?? fs.readFileSync(filename, 'utf8');
    const before = candidates.filter(candidate => source.includes(candidate)).sort((a, b) => b.length - a.length)[0];
    if (before) {
        if (source.split(before).length !== 2) throw new Error(`Unexpected match count: ${file}`);
        pending.set(filename, source.replace(before, after));
    } else if (!source.includes(after)) {
        throw new Error(`Unsupported footer version: ${file}`);
    }
}

for (const [file, vue, normalize, props, options, hrefs, images] of [
    ['js/375.43b3c74e.js', 'a', 'i', 'o', 'd', 'l', 'n'],
    ['js/851.732f2b9d.js', 'o', 'n', 'i', 'u', 's', 'a'],
]) {
    const before = `return(0,${vue}.uX)(),(0,${vue}.CE)("a",{href:${options}.logoHref,target:${props}.target,class:"logo-link",rel:"noopener noreferrer"},[(0,${vue}.Lk)("img",{"data-entry":"left",class:(0,${normalize}.C4)(${options}.logoClasses),alt:${props}.alt,src:${options}.logoUrl},null,10,${images})],8,${hrefs})`;
    // Only the wrapper is a block. Dynamic children retain their patch order.
    const after = `return(0,${vue}.uX)(),(0,${vue}.CE)("div",{class:"site-shortcuts",style:"display:contents"},[(0,${vue}.Lk)("a",{href:${options}.logoHref,target:${props}.target,class:(0,${normalize}.C4)(["logo-link","site-music-link",{"site-music-link--fixed":"fixed"===${props}.position}]),title:"过来人音乐","aria-label":"过来人音乐",rel:"noopener noreferrer"},[(0,${vue}.Lk)("img",{"data-entry":"left",class:(0,${normalize}.C4)(${options}.logoClasses),alt:${props}.alt,src:${options}.logoUrl},null,10,${images})],10,${hrefs}),t[0]||(t[0]=(0,${vue}.Lk)("a",{href:"https://yasuo.520kx.dpdns.org/",target:"_blank",rel:"noopener noreferrer",class:"image-compress-button",title:"图片压缩","aria-label":"图片压缩"},[(0,${vue}.Lk)("img",{src:"/img/guolairen-compress.png",alt:"",width:"128",height:"128","aria-hidden":"true"})],-1))])`;
    const withHome = after.slice(0, -2) + `,t[1]||(t[1]=(0,${vue}.Lk)("a",{href:"/",class:"site-home-link site-home-link--frontend",title:"回到首页","aria-label":"回到首页"},[(0,${vue}.bF)((0,${vue}.g2)("font-awesome-icon"),{icon:"home","aria-hidden":"true"})],-1))])`;
    replaceAny(file, [before, after], withHome);
    replace(file, 'href:{type:String,default:"https://github.com/MarSeventh/CloudFlare-ImgBed"}',
        'href:{type:String,default:"https://yinyue.520xg.dpdns.org/"}');
    replace(file, 'alt:{type:String,default:"Sanyue logo"}', 'alt:{type:String,default:"过来人音乐"}');
    const requireAlias = file.startsWith('js/375') ? 'o' : 'i';
    replace(file, `logoUrl(){return this.customSrc||this.userConfig?.logoUrl||${requireAlias}(33153)}`,
        'logoUrl(){return this.customSrc||this.userConfig?.logoUrl||"/img/guolairen-music.png"}');
    const display = file.startsWith('js/375') ? 'i' : 'n';
    const originalFooter = `const c=(0,${vue}.g2)("font-awesome-icon");return ${options}.disableFooter?(0,${vue}.Q3)("",!0):((0,${vue}.uX)(),(0,${vue}.CE)("div",${hrefs},[(0,${vue}.Lk)("p",null,[(0,${vue}.eW)("© 2024-"+(0,${display}.v_)(${options}.thisYear)+" Designed by ",1),t[0]||(t[0]=(0,${vue}.Lk)("a",{class:"footer-name",href:"https://github.com/MarSeventh",target:"_blank"},"SanyueQi",-1)),t[1]||(t[1]=(0,${vue}.eW)(" for You! ",-1)),(0,${vue}.Lk)("a",{href:${options}.footerLink,target:"_blank"},[(0,${vue}.bF)(c,{icon:"paper-plane",class:"footer-link-icon"})],8,${images})])]))`;
    const previousFooter = originalFooter.replace('" Designed by "', `" "+(0,${display}.v_)(${options}.ownerName)+" · "`).replace('" for You! "', '" "');
    const footer = `return ${options}.disableFooter?(0,${vue}.Q3)("",!0):((0,${vue}.uX)(),(0,${vue}.CE)("div",${hrefs},[(0,${vue}.Lk)("p",{class:"footer-copyright"},"© 2024-"+(0,${display}.v_)(${options}.thisYear)+" "+(0,${display}.v_)(${options}.ownerName),1)]))`;
    replaceAny(file, [previousFooter, originalFooter], footer);
    const footerLink = 'footerLink(){return this.userConfig?.footerLink||"https://github.com/MarSeventh"}';
    const ownerName = 'ownerName(){return this.userConfig?.ownerName||"过来人图床"}';
    replaceAny(file, [`${ownerName},${footerLink}`, footerLink], ownerName);
}
const adminHome = 't[2]||(t[2]=(0,o.Lk)("a",{href:"/",class:"admin-header-control site-home-link site-home-link--admin",title:"回到首页","aria-label":"回到首页"},[(0,o.bF)(u,{icon:"home","aria-hidden":"true"})],-1))';
replace('js/433.91440007.js',
    `return(0,o.uX)(),(0,o.CE)("div",v,[${adminHome},(0,o.bF)(c,{class:"admin-header-control"}),`,
    'return(0,o.uX)(),(0,o.CE)("div",v,[(0,o.bF)(c,{class:"admin-header-control"}),');
replace('js/433.91440007.js',
    ',8,["disabled","content"])])}var x={name:"AdminHeaderActions"',
    `,8,["disabled","content"]),${adminHome}])}var x={name:"AdminHeaderActions"`);
replace('js/375.43b3c74e.js', 'ownerName(){return this.configuredOwnerName||"Sanyue"}',
    'ownerName(){return this.configuredOwnerName||"过来人图床"}');
replace('js/375.43b3c74e.js', 'headerTitle(){return this.configuredOwnerName||"Sanyue ImgHub"}',
    'headerTitle(){return this.configuredOwnerName||"过来人图床"}');
replace('js/app.b6b1d908.js', 'document.title=e?.siteTitle||"Sanyue ImgHub"',
    'document.title=e?.siteTitle||"过来人图床-免费的图片外链"');
// The official static/media favicon fallbacks do not exist in this archive.
for (const icon of ['logo-dark', 'logo']) {
    const filename = path.join(dist, 'js/app.b6b1d908.js');
    const source = pending.get(filename) ?? fs.readFileSync(filename, 'utf8');
    const before = `"/static/media/${icon}.png"`;
    if (source.includes(before)) pending.set(filename, source.replaceAll(before, '"/img/guolairen-music.png"'));
}
replace('entry/entry-loader.c76da827.js', 'i?"Sanyue ImgHub":""', 'i?"过来人图床":""');
replace('index.html', '<html lang="">', '<html lang="zh-CN">');
replace('index.html', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover',
    'width=device-width,initial-scale=1,viewport-fit=cover');
replace('index.html', '<title>Sanyue ImgHub</title>', '<title>过来人图床-免费的图片外链</title>');
replace('index.html', 'content="Sanyue ImgHub - A modern file hosting platform"',
    'content="过来人图床-免费的图片外链"');
replace('index.html', 'content="Sanyue, ImgHub, file hosting, image hosting, cloud storage"',
    'content="过来人图床, 图片外链, 图床, image hosting"');
replace('index.html', 'href="/css/app.7127532f.css">',
    'href="/css/app.7127532f.css"><link rel="stylesheet" href="/css/guolairen.css">');
const index = path.join(dist, 'index.html');
if (pending.has(index)) pending.set(index, pending.get(index).replaceAll('/static/media/logo.png', '/img/guolairen-music.png'));

function assertSafe(filename) {
    const rel = path.relative(root, filename);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Outside source root');
    let current = filename;
    while (true) {
        if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Linked path: ${current}`);
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
}
for (const filename of pending.keys()) {
    assertSafe(filename);
    assertSafe(filename + '.gz');
}
for (const [filename, source] of pending) {
    fs.writeFileSync(filename, source);
    if (fs.existsSync(filename + '.gz')) fs.writeFileSync(filename + '.gz', gzipSync(Buffer.from(source), { level: 9 }));
    console.log(`Updated ${path.relative(root, filename)}`);
}
