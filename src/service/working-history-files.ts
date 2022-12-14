import * as fs from 'fs';
import * as path from 'path';
import { config } from '../lib/global/config';
import DiffPresenter from '../lib/diff-presenter';
import { md5 } from '../lib/utility/md5';

export class WorkingHistoryFiles {
    private diffPresenter = new DiffPresenter();
    private historyDirectoryFullpath: string;
    constructor() {
        this.historyDirectoryFullpath = path.join(config.localDirectory, '/history');
    }

    convertTimeToDate(timestamp: any, type?: string) {
        var month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        var monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dirnameToDate: any = new Date(parseInt(timestamp));
        var dd = String(dirnameToDate.getDate()).padStart(2, '0');
        var m = String(dirnameToDate.getMonth() + 1).padStart(2, '0');
        var mm = monthShort[dirnameToDate.getMonth()];
        var mmm = month[dirnameToDate.getMonth()];
        var yyyy = dirnameToDate.getFullYear();

        if (dirnameToDate !== "Invalid Date" && !isNaN(dirnameToDate)) {
            switch (type) {
                case 'short':
                    return `${mm} ${dd}, ${yyyy}`;
                case 'monthYear':
                    return `${mmm} ${yyyy}`
                case 'monthYearNumber':
                    return `${yyyy}${m}`
                default:
                    return `${mmm} ${dd}, ${yyyy}`;
            }
        } else {
            return null;
        }
    }

    readHistoryFolder() {
        let histDBList: any[] = [];
        const historyDirectory = fs.readdirSync(this.historyDirectoryFullpath, { withFileTypes: true });
        historyDirectory.forEach((dir) => {
            const historyMemberFullpath = path.join(this.historyDirectoryFullpath, dir.name);
            if (fs.statSync(historyMemberFullpath).isDirectory()) {
                const historyCollection = fs.readdirSync(historyMemberFullpath, { withFileTypes: true });
                const convertNameDt = this.convertTimeToDate(dir.name);
                histDBList.push({
                    dirname: dir.name,
                    text: convertNameDt,
                    path: historyMemberFullpath,
                    collections: historyCollection
                });
            }
        });

        return histDBList;
    }

    readHistoryCollections(fullPath: string) {
        let list: Array<any> = [];
        if (fs.statSync(fullPath).isDirectory()) {
            const collections = fs.readdirSync(fullPath, { withFileTypes: true });
            collections.forEach((file) => {
                let collectionFileFullPath = path.join(fullPath, file.name);
                if (fs.statSync(collectionFileFullPath).isFile()) {
                    let dataContent = fs.readFileSync(collectionFileFullPath, { encoding: 'utf-8' });
                    dataContent = JSON.parse(dataContent);
                    list.push(Object.assign(dataContent, { index: path.basename(collectionFileFullPath, '.json') }));
                }
            });
        }
        return { [path.basename(fullPath)]: list };
    }

    async getHistoryByMonth() {
        let list: any = {};
        if (fs.statSync(this.historyDirectoryFullpath).isDirectory()) {
            const allList = await fs.readdirSync(this.historyDirectoryFullpath, { withFileTypes: true });
            allList.forEach((dir) => {
                if (fs.statSync(path.join(this.historyDirectoryFullpath, dir.name)).isDirectory()) {
                    const yrMonth = this.convertTimeToDate(dir.name, 'monthYear');
                    const yrMonthNum = this.convertTimeToDate(dir.name, 'monthYearNumber');
                    if (yrMonth) {
                        if (list && !list.hasOwnProperty(yrMonthNum)) {
                            Object.assign(list, {
                                [yrMonthNum]: {
                                    text: yrMonth,
                                    count: 1
                                }
                            })
                        } else {
                            const item = list[yrMonthNum as keyof typeof list];
                            Object.assign(list, {
                                [yrMonthNum]: {
                                    text: yrMonth,
                                    count: item.count + 1
                                }
                            })
                        }
                    }
                }
            })
        }
        return list;
    }

    async getHistoryDatesByMonth(yearMonthNumber: any) {
        let list: Array<any> = [];
        if (fs.statSync(this.historyDirectoryFullpath).isDirectory()) {
            const allList = await fs.readdirSync(this.historyDirectoryFullpath, { withFileTypes: true });
            allList.forEach((dir) => {
                const date = this.convertTimeToDate(dir.name);
                const yrMonthNum = this.convertTimeToDate(dir.name, 'monthYearNumber');
                const lastChangeHistDir = path.join(this.historyDirectoryFullpath, dir.name, 'last');
                let count = 0;
                if (date) {
                    if (fs.existsSync(lastChangeHistDir)) {
                        const dirMember = fs.readdirSync(lastChangeHistDir);
                        count = dirMember.length;
                    }
                    if (yearMonthNumber === yrMonthNum) {
                        list.push({
                            text: date,
                            dirname: dir.name,
                            count: count
                        })
                    }
                }
            })
        }
        return list;
    }

    async takeHistoryDiff(historyItem: any) {
        const historyDir = path.join(config.localDirectory, '/history');
        const dataParentDir = path.join(historyDir, historyItem.dirname);

        const originFx = path.join(dataParentDir, '/origin', historyItem.index);
        const lastFx = path.join(dataParentDir, '/last', historyItem.index);

        let date = this.convertTimeToDate(historyItem.dirname, 'short');

        await this.diffPresenter.takeDiff(originFx, lastFx, date, historyItem.rpath);
    }

    async deleteHistoryFile(data: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!data) {
                reject('Invalid data to process');
            }
            const targetDir = path.join(config.localDirectory, 'history', data.dirname);
            const targetFile = path.join(targetDir, data.index + '.json');
            if (fs.existsSync(targetFile)) {
                const fileData = fs.readFileSync(targetFile, { encoding: 'utf-8' });
                let trgPath = JSON.parse(fileData).rpath;
                let md5path = md5(path.join(config.workingDirectory, trgPath));
                let fileInLastDir = path.join(targetDir, 'last', md5path);
                fs.unlink(targetFile, (err) => {
                    if (err) {
                        reject('Error deleting history data.');
                    } else {
                        if (fs.existsSync(fileInLastDir)) {
                            fs.unlinkSync(fileInLastDir);
                        }
                        resolve(true);
                    }
                })
            }
        })
    }

    async deleteBulkHistoryFile(data: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!data) {
                reject('Invalid data to process');
            }
            Promise.all(data.list.map(item => {
                return new Promise((resolve, reject) => {
                    const targetDir = path.join(config.localDirectory, 'history', data.dirname);
                    const targetFile = path.join(targetDir, item.index + '.json');
                    const fileData = fs.readFileSync(targetFile, { encoding: 'utf-8' });
                    let trgPath = JSON.parse(fileData).rpath;
                    let md5path = md5(path.join(config.workingDirectory, trgPath));
                    let fileInLastDir = path.join(targetDir, 'last', md5path);

                    if (fs.existsSync(targetFile)) {
                        fs.unlink(targetFile, (err) => {
                            if (err) {
                                reject('Error deleting history data.');
                            } else {
                                if (fs.existsSync(fileInLastDir)) {
                                    fs.unlinkSync(fileInLastDir);
                                }
                                resolve(true);
                            }
                        })
                    }
                })
            }))
                .then(() => {
                    resolve('Finnish');
                })
        })
    }

    deleteHistoryFolder(data: any): Promise<any> {
        return new Promise(async (resolve, reject) => {
            if (!data) {
                reject('Invalid data to process');
            }
            const targetDir = path.join(config.localDirectory, '/history', data.dirname);
            if (fs.existsSync(targetDir)) {
                fs.rm(
                    targetDir,
                    {
                        recursive: true,
                        force: true,
                    },
                    (err) => {
                        if (err) {
                            resolve(err)
                        } else {
                            resolve(true)
                        }
                    }
                )
            }
        })
    }

    walk(dir) {
        return new Promise((resolve, reject) => {
            fs.readdir(dir, (error, files) => {
                if (error) {
                    return reject(error);
                }
                Promise.all(files.map((file) => {
                    return new Promise((resolve, reject) => {
                        const filepath = path.join(dir, file);
                        fs.stat(filepath, (error, stats) => {
                            if (error) {
                                return reject(error);
                            }
                            if (stats.isDirectory()) {
                                this.walk(filepath).then(resolve);
                            } else if (stats.isFile()) {
                                resolve(filepath);
                            }
                        });
                    });
                }))
                    .then((foldersContents) => {
                        resolve(foldersContents.reduce((all: any, folderContents) => all.concat(folderContents), []));
                    });
            });
        });
    }


    async getAllFilesRecursively(folder: string, options?: {
        sort?: string // byTimeCreated | byTimeModified | name
    }) {
        let allFiles = [];
        const list = await this.walk(folder);

        for (let f of (list as any)) {
            const stat = fs.statSync(f);
            if (stat.isFile()) {
                allFiles.push({
                    mtime: new Date(stat.mtime).getTime(),
                    ctime: new Date(stat.ctime).getTime(),
                    path: f,
                    stat: stat
                })
            }
        }

        if (!options) {
            return allFiles;
        } else {
            if (options.sort === 'byTimeModified') {
                return allFiles.sort((a, b) => (a.mtime > b.mtime) ? -1 : ((b.mtime < a.mtime) ? 1 : 0));
            } else {
                return allFiles.sort((a, b) => (a.path > b.path) ? -1 : ((b.path < a.path) ? 1 : 0));
            }
        }

    }
}