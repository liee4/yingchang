import {createHash} from 'node:crypto';
import {readFile, writeFile, copyFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {buildCore, projectRoot} from './build-core.mjs';

// Refuse stale compiled code after a collaborator edits C++ sources.
const inputs = ['main.cpp','documentary_catalog.cpp','reviews.cpp','record_codec.cpp','data_store.cpp','core_service.cpp',
  'documentary_catalog.h','reviews.h','text_file.h','record_codec.h','data_store.h','core_service.h','accounts.h','third_party/json.hpp'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const directory = join(projectRoot,'runtime','cpp');
const executable = join(directory,'documentary-core.exe');
const manifestPath = join(directory,'portable.json');

async function fingerprint() {
  return Object.fromEntries(await Promise.all(inputs.map(async name => [name,digest(await readFile(join(projectRoot,'cpp',name)))])));
}

try {
  if (process.argv.includes('--refresh-core')) {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('随包免安装核心面向 Windows 64 位。其他平台请按 README 从源码启动。');
    const binary = await buildCore();
    await mkdir(directory,{recursive:true});
    await copyFile(binary,executable);
    await writeFile(manifestPath,JSON.stringify({format:1,platform:process.platform,arch:process.arch,
      binarySha256:digest(await readFile(executable)),sources:await fingerprint()},null,2));
    console.log('C++ 核心已重新编译，免安装启动文件也已同步。');
  } else {
    const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
    if (manifest.platform !== process.platform || manifest.arch !== process.arch) throw new Error('随包运行环境适用于 Windows 64 位。其他系统请按 README 安装 Node.js 和 C++17 编译器。');
    const current = await fingerprint();
    if (inputs.some(name => current[name] !== manifest.sources[name])) throw new Error('C++ 源码已修改。请先运行「重新编译核心.cmd」，让网页使用最新 C++ 代码。');
    if (digest(await readFile(executable)) !== manifest.binarySha256) throw new Error('随包 C++ 程序校验失败，请重新解压完整压缩包或重新编译。');
    const flags = process.argv.slice(2).filter(flag => flag !== '--no-open');
    if (!process.argv.includes('--no-open')) flags.push('--open');
    const child = spawn(process.execPath,[join(projectRoot,'web','scripts','serve.mjs'),...flags],{
      cwd:projectRoot,stdio:'inherit',windowsHide:true,env:{...process.env,
        YINGCHANG_CORE_EXECUTABLE:executable,YINGCHANG_DATA_DIR:join(projectRoot,'data'),
        YINGCHANG_SEED_FILE:join(projectRoot,'resources','catalog-seed.json'),
        YINGCHANG_LEGACY_WEB_FILE:join(projectRoot,'web','data','catalog.json'),YINGCHANG_LEGACY_CPP_DIR:join(projectRoot,'cpp')}
    });
    child.once('error',error => {console.error(error.message);process.exitCode=1;});
    child.once('exit',code => {process.exitCode=code ?? 1;});
    process.on('SIGINT',()=>child.kill('SIGINT'));
    process.on('SIGTERM',()=>child.kill('SIGTERM'));
  }
} catch(error) {console.error('无法启动免安装版：'+error.message);process.exitCode=1;}
