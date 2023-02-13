class Exchange {
    static addItem(obj) {
        return new Promise(async (resolve, reject) => {
            const {
                Physical
            } = require('../models')
            var {
                user,
                body: {
                    exchange,
                    physical
                }
            } = obj;
            if (physical ?.UVK_state == 'GOOD') {
                try {
                    var ex = await AddExchangeData({
                        exchange,
                        user
                    }).then(r => r)
                    console.log(ex);
                    Physical.create({
                        exchange: ex._id,
                        physical
                    }).then(r => {
                        resolve(ex)
                    }).catch(e => {
                        ex.delete()
                        reject(e)
                    })
                } catch (e) {
                    reject(e)
                }
            } else {
                const {
                    getPhysicalUVKInfo
                } = require('./integrator')
                getPhysicalUVKInfo({
                    query: physical.fio
                }).then(async res => {
                    if (res.result_code == 'BAD') {
                        reject('UVK black list')
                    } else {
                        try {
                            var ex = await AddExchangeData({
                                exchange,
                                user
                            }).then(r => r)
                            console.log(ex);
                            Physical.create({
                                exchange: ex._id,
                                physical
                            }).then(r => {
                                resolve(ex)
                            }).catch(e => {
                                ex.delete()
                                reject(e)
                            })
                        } catch (e) {
                            reject(e)
                        }
                    }
                })
            }
        })
    }

    static getItems() {
        return new Promise((resolve, reject) => {
            this.find({
                status: 1
            }).then(async data => {
                if (data.length) {
                    var types = []
                    var currencies = []
                    var result = []
                    var typeNames = [{
                        type: 'B',
                        name: 'Покупка'
                    }, {
                        type: 'S',
                        name: 'Продажа'
                    }, {
                        type: 'C',
                        name: 'Конверсия'
                    }]
                    data.map(item => item.type).reduce((prev, curr) => {
                        if (!types.includes(curr)) return types.push(curr)
                    })

                    data.map(item => item.fromCurr + '/' + item.toCurr + '/' + item.rate).reduce((prev, curr) => {
                        if (!currencies.includes(curr)) return currencies.push(curr)
                    })

                    var currencyNames = await getCurrency().then(data => data)

                    for (var i = 0; i < types.length; i++) {
                        var type = types[i]
                        for (var j = 0; j < currencies.length; j++) {
                            var currency = currencies[j]
                            var [fromCurr, toCurr, rate] = currency.split('/')
                            var init = 0;
                            var filtered = data.filter(item => item.type == type && item.fromCurr == fromCurr && item.toCurr == toCurr && item.rate == rate)
                            var toAmount = filtered.reduce((prev, curr) => prev + curr.exchangeAmount, init)
                            var fromAmount = filtered.reduce((prev, curr) => prev + curr.amount, init)
                            if (filtered.length)
                                result.push({
                                    type,
                                    typeName: typeNames.find(item => item.type == type).name,
                                    fromCurrency: fromCurr,
                                    fromCurrencyName: currencyNames.find(item => item.code == fromCurr).name,
                                    toCurrency: toCurr,
                                    toCurrencyName: currencyNames.find(item => item.code == toCurr).name,
                                    fromAmount,
                                    toAmount,
                                    rate,
                                    uniqueStr: type + currency,
                                    transactions: filtered
                                })
                        }
                    }
                    resolve(result)
                } else {
                    resolve([])
                }
            }).catch(err => {
                console.log(err);
                reject(err)
            })
        })
    }

    static acceptItem(obj) {
        return new Promise(async (resolve, reject) => {
            var {
                invoice
            } = obj
            const {
                AccTransaction,
                Account
            } = require('../models');
            var tx = await AccTransaction.find({
                invoice,
                status: 1
            })
            if (tx.length) {
                var minus = tx.filter(t => t.type == 'R').map(t => {
                    return {
                        amount: t.amount,
                        account: t.account
                    }
                })[0]
                var plyus = tx.filter(t => t.type == 'P').map(t => {
                    return {
                        amount: t.amount,
                        account: t.account
                    }
                })[0]
                Account.outcome(minus).then(async resMinus => {
                    await Account.income(plyus).then(async resPlyus => {
                        await this.updateMany({
                            invoice
                        }, {
                            $set: {
                                status: 3
                            }
                        }).then(data => {
                            resolve(data)
                        }).catch(err => {
                            console.log(err);
                            Account.outcome(plyus).then(d => d)
                            Account.income(minus).then(d => d)
                            reject(err)
                        })
                    }).catch(err => {
                        console.log(err);
                        Account.outcome(plyus).then(d => d)
                        reject(err)
                    })
                }).catch(err => {
                    console.log(err);
                    Account.income(minus).then(d => d)
                    reject(err)
                })
            } else {
                reject('invoice not found!')
            }
        })
    }
    static approveItems(obj) {
        return new Promise((resolve, reject) => {
            try {
                var {
                    user: {
                        branch,
                        subBranch,
                        type
                    },
                    body: {
                        uniqueStr
                    }
                } = obj;
                var [fromCurr, toCurr, rate] = uniqueStr.split('/')
                var operationType = fromCurr[0]
                fromCurr = fromCurr.substring(1);
                this.find({
                    fromCurr,
                    toCurr,
                    rate,
                    status: 1
                }).then(async result => {
                    const {
                        getAccountName,
                        sendDirectTransaction
                    } = require('./integrator')
                    var init = 0
                    var totalIn = await result.reduce((prev, curr) => {
                        return prev + curr.amount
                    }, init)
                    var totalOut = await result.reduce((prev, curr) => {
                        return prev + curr.exchangeAmount
                    }, init)
                    Promise.all([getCashAccount({
                        branch,
                        subBranch,
                        userType: type,
                        currency: fromCurr
                    }), getCashAccount({
                        branch,
                        subBranch,
                        userType: type,
                        currency: toCurr
                    }), getExchangeAccount({
                        branch,
                        currency: fromCurr
                    }), getExchangeAccount({
                        branch,
                        currency: toCurr
                    }), getSequence('Invoice')]).then(async vals => {
                        var [plus, minus, plusEx, minusEx, invoice] = vals
                        console.log("Приход", plus);
                        console.log("Расход", minus);
                        console.log("Приход Обмен", plusEx);
                        console.log("Расход Обмен", minusEx);
                        var payload = []
                        switch (operationType) {
                            case 'B': {
                                payload.push({
                                    "MFO_DT": branch,
                                    "ACCOUNT_DT": plusEx.buyPositionUzs,
                                    "MFO_CR": branch,
                                    "INN_CR": "1234567",
                                    "ACCOUNT_CR": minus.account,
                                    "NAME_CR": await getAccountName({
                                        branch,
                                        account: minus.account
                                    }).then(r => r[0].name),
                                    "SUMMA": Math.round(totalOut * 100, 0),
                                    "NAZ_PLA": `Покупка вал. средств ${totalIn} по курсу ${rate} за сегодня)`,
                                    "NUM_DOC": invoice,
                                    "STATE": 3,
                                    "CODE_NAZ_PLA": "",
                                    "TYPE_DOC": "03",
                                    "TRANSACTION_ID": await getSequence('parent_id').then(r => r),
                                    "CASH_CODE": plusEx.buyPositionCashCode.substring(0, 2),
                                    "ID_TRANSH_PURP": plusEx.buyPositionCashCode.substring(2, 4),
                                }, {
                                    "MFO_DT": branch,
                                    "ACCOUNT_DT": plus.account,
                                    "MFO_CR": branch,
                                    "INN_CR": "1234567",
                                    "ACCOUNT_CR": plusEx.buyAccount,
                                    "NAME_CR": await getAccountName({
                                        branch,
                                        account: plusEx.buyAccount
                                    }).then(r => r[0].name),
                                    "SUMMA": Math.round(totalIn * 100),
                                    "NAZ_PLA": `Покупка вал. средств ${totalIn} по курсу ${rate} за сегодня)`,
                                    "NUM_DOC": invoice,
                                    "STATE": 3,
                                    "CODE_NAZ_PLA": plusEx.buyNazn,
                                    "TYPE_DOC": "93",
                                    "TRANSACTION_ID": await getSequence('parent_id').then(r => r),
                                    "CASH_CODE": plusEx.buyCashCode.substring(0, 2),
                                    "ID_TRANSH_PURP": plusEx.buyCashCode.substring(2, 4),
                                })
                            }
                            break;
                        case 'S': {
                            payload.push({
                                "MFO_DT": branch,
                                "ACCOUNT_DT": minusEx.sellAccount,
                                "MFO_CR": branch,
                                "INN_CR": "1234567",
                                "ACCOUNT_CR": minus.account,
                                "NAME_CR": await getAccountName({
                                    branch,
                                    account: minus.account
                                }).then(r => r[0].name),
                                "SUMMA": Math.round(totalOut * 100),
                                "NAZ_PLA": `Продажа вал. средств ${totalIn} по курсу ${rate} за сегодня)`,
                                "NUM_DOC": invoice,
                                "STATE": 3,
                                "CODE_NAZ_PLA": minusEx.sellNazn,
                                "TYPE_DOC": "03",
                                "TRANSACTION_ID": await getSequence('parent_id').then(r => r),
                                "CASH_CODE": minusEx.sellCashCode.substring(0, 2),
                                "ID_TRANSH_PURP": minusEx.sellCashCode.substring(2, 4),
                            }, {
                                "MFO_DT": branch,
                                "ACCOUNT_DT": plus.account,
                                "MFO_CR": branch,
                                "INN_CR": "1234567",
                                "ACCOUNT_CR": minusEx.sellPositionUzs,
                                "NAME_CR": await getAccountName({
                                    branch,
                                    account: minusEx.sellPositionUzs
                                }).then(r => r[0].name),
                                "SUMMA": Math.round(totalIn * 100),
                                "NAZ_PLA": `Продажа вал. средств ${totalIn} по курсу ${rate} за сегодня)`,
                                "NUM_DOC": invoice,
                                "STATE": 3,
                                "CODE_NAZ_PLA": "71041",
                                "TYPE_DOC": "93",
                                "TRANSACTION_ID": await getSequence('parent_id').then(r => r),
                                "CASH_CODE": minusEx.sellPositionCashCode.substring(0, 2),
                                "ID_TRANSH_PURP": minusEx.sellPositionCashCode.substring(2, 4),
                            })
                        }
                        break;
                        case 'C': {
                            payload.push({
                                "MFO_DT": branch,
                                "ACCOUNT_DT": plus.account,
                                "MFO_CR": branch,
                                "INN_CR": "1234567",
                                "ACCOUNT_CR": plusEx.buyAccount,
                                "NAME_CR": await getAccountName({
                                    branch,
                                    account: plusEx.buyAccount
                                }).then(r => r[0].name),
                                "SUMMA": Math.round(totalIn * 100),
                                "NAZ_PLA": `(Конвертация) Покупка вал. средств ${totalIn} по курсу ${rate} за сегодня)`,
                                "NUM_DOC": invoice,
                                "STATE": 3,
                                "CODE_NAZ_PLA": plusEx.buyNazn,
                                "TYPE_DOC": "93",
                                "TRANSACTION_ID": await getSequence('parent_id').then(r => r),
                                "CASH_CODE": plusEx.buyCashCode.substring(0, 2),
                                "ID_TRANSH_PURP": plusEx.buyCashCode.substring(2, 4),
                            }, {
                                "MFO_DT": branch,
                                "ACCOUNT_DT": minusEx.sellAccount,
                                "MFO_CR": branch,
                                "INN_CR": "1234567",
                                "ACCOUNT_CR": minus.account,
                                "NAME_CR": await getAccountName({
                                    branch,
                                    account: minus.account
                                }).then(r => r[0].name),
                                "SUMMA": Math.round(totalOut * 100),
                                "NAZ_PLA": `(Конвертация) Продажа вал. средств ${totalIn} по курсу ${rate} за сегодня)`,
                                "NUM_DOC": invoice,
                                "STATE": 3,
                                "CODE_NAZ_PLA": minusEx.sellNazn,
                                "TYPE_DOC": "03",
                                "TRANSACTION_ID": await getSequence('parent_id').then(r => r),
                                "CASH_CODE": minusEx.sellCashCode.substring(0, 2),
                                "ID_TRANSH_PURP": minusEx.sellCashCode.substring(2, 4),
                            })
                        }
                        break;
                        }
                        var flag = 1
                        try {
                            for (var i = 0; i < payload.length; i++) {
                                await sendDirectTransaction(payload[i]).then(r => {
                                    console.log(r);
                                }).catch(e => {
                                    flag = 0
                                    reject(e)
                                })
                            }
                            console.log(payload);
                        } catch (e) {
                            console.log(e);
                            reject(e)
                        } finally {
                            if(flag)
                            this.updateMany({
                                fromCurr,
                                toCurr,
                                rate,
                                status: 1
                            }, {
                                $set: {
                                    status: 3
                                }
                            }, {
                                new: true
                            }).then(r => {
                                resolve('ok')
                            }).catch(e => {
                                reject(e)
                            })
                        }
                    })
                    // resolve({
                    //     totalIn,
                    //     totalOut
                    // });
                }).catch(e => {
                    console.log(e);
                    reject(e)
                })
            } catch (e) {
                console.log(e);
            }
        })
    }
}

function getCurrency() {
    return new Promise((resolve, reject) => {
        const {
            Currency,
            AccTransaction
        } = require('../models');
        Currency.find().then(data => {
            resolve(data)
        }).catch(err => {
            reject(err)
        })
    })
}

function getExchangeRate() {
    return new Promise((resolve, reject) => {
        const {
            getExchangeRate
        } = require('./integrator');
        getExchangeRate().then(data => {
            resolve(data)
        }).catch(err => {
            reject(err)
        })
    })

}

function getSequence(name) {
    return new Promise((resolve, reject) => {
        const {
            Sequence
        } = require('../models')
        Sequence.incr({
            name
        }).then(result => {
            resolve(result.value)
        }).catch(err => {
            reject(err)
        })
    })
}

function addAccTransation(obj) {
    return new Promise((resolve, reject) => {
        const {
            AccTransaction
        } = require('../models')
        AccTransaction.addItem(obj).then(result => {
            resolve(result)
        }).catch(err => {
            reject(err)
        })
    })
}

function getUserAccounts(id) {
    return new Promise((resolve, reject) => {
        const {
            Account
        } = require('../models');
        Account.find({
            userID: id
        }).then(result => {
            resolve(result)
        }).catch(err => {
            reject(err)
        })
    })
}

function getCashAccount(obj) {
    return new Promise((resolve, reject) => {
        const {
            AccountCashMap
        } = require('../models')
        var {
            userType,
            currency,
            branch,
            subBranch
        } = obj
        AccountCashMap.findOne(obj).then(r => {
            resolve(r)
        }).catch(e => {
            console.log(e);
            reject(e)
        })
    })
}

function getExchangeAccount(obj) {
    return new Promise((resolve, reject) => {
        const {
            ExchangeAccMap
        } = require('../models')
        var {
            branch,
            currency
        } = obj
        ExchangeAccMap.findOne(obj).then(r => {
            resolve(r)
        }).catch(e => {
            console.log(e);
            reject(e)
        })
    })
}

function AddExchangeData(obj) {
    var {
        exchange,
        user
    } = obj
    return new Promise((resolve, reject) => {
        Promise.all([getExchangeRate(), getSequence('Invoice')]).then(async values => {
            const {
                Exchange
            } = require('../models')
            var obj = exchange
            var [rates, invoice] = values;
            var msg = ''
            obj.invoice = invoice
            if (obj.type == 'S') {
                obj.toCurr = obj.toCurrency;
                obj.fromCurr = '000';
                var rate = rates.find(rate => rate.course_type == 4 && rate.currency == obj.toCurr).course
                if (obj.course !== rate) {
                    obj.course = rate;
                    msg = `Курс изменился с ${obj.course} на ${rate}, был произведен расчет по новому курсу`;
                }
                obj.exchangeAmount = (parseFloat(obj.amount) / rate).toFixed(5)
                obj.rate = obj.course
            }
            if (obj.type == 'B') {
                obj.fromCurr = obj.fromCurrency;
                obj.toCurr = '000';
                var rate = rates.find(rate => rate.course_type == 5 && rate.currency == obj.fromCurr).course
                if (obj.course !== rate) {
                    obj.course = rate;
                    msg = `Курс изменился с ${obj.course} на ${rate}, был произведен расчет по новому курсу`;
                }
                obj.exchangeAmount = (parseFloat(obj.amount) * rate).toFixed(5)
                obj.rate = obj.course
            }
            if (obj.type == 'C') {
                obj.fromCurr = obj.fromCurrency;
                obj.toCurr = obj.toCurrency;
                var rate1 = rates.find(rate => rate.course_type == 5 && rate.currency == obj.fromCurr).course
                var rate2 = rates.find(rate => rate.course_type == 4 && rate.currency == obj.toCurr).course
                obj.exchangeAmount = (parseFloat(obj.amount) * (rate1 / rate2).toFixed(5))
                obj.rate = (rate1 / rate2).toFixed(5)
            }
            var accTxP = {
                branch: user.branch,
                subBranch: user.subBranch,
                account: await getUserAccounts(user._id).then(data => data.filter(acc => acc.account.substring(5, 8) == obj.fromCurr).map(acc => acc.account)[0]),
                invoice,
                type: "P",
                currency: obj.fromCurr,
                amount: obj.amount
            }
            var accTxR = {
                branch: user.branch,
                subBranch: user.subBranch,
                account: await getUserAccounts(user._id).then(data => data.filter(acc => acc.account.substring(5, 8) == obj.toCurr).map(acc => acc.account)[0]),
                invoice,
                type: "R",
                currency: obj.toCurr,
                amount: obj.exchangeAmount
            }
            Exchange.create(obj).then(async result => {
                await addAccTransation(accTxP).then(async p => {
                    await addAccTransation(accTxR).then(r => {
                        resolve(result)
                    }).catch(err => {
                        result.delete()
                        p.delete()
                        reject(err)
                    })
                }).catch(err => {
                    result.delete()
                    reject(err)
                })
            }).catch(err => {
                reject(err)
            })
        }).catch(err => {
            console.log(err);
            reject(err)
        })
    })
}

function sendTransaction(obj) {
    var {
        branch,
        dt,
        cr,
        amount,
        invoice,
        naz_pla_text,
        type_doc,
        cash_code,
        id_transh_purp
    } = obj
    const {
        integratorURL
    } = require('../conf')
    const {
        getAccountName
    } = require('./integrator');
    const axios = require('axios')
    return new Promise((resolve, reject) => {
        Promise.all([getSequence('parent_id'), getAccountName({
            branch,
            account: dt
        })]).then(values => {
            var [parent_id, corr] = values;
            var payload = {
                "MFO_DT": branch,
                "ACCOUNT_DT": cr,
                "MFO_CR": branch,
                "INN_CR": "1234567",
                "ACCOUNT_CR": dt,
                "NAME_CR": corr[0].name,
                "SUMMA": amount * 100,
                "NAZ_PLA": naz_pla_text,
                "NUM_DOC": invoice,
                "STATE": 3,
                "CODE_NAZ_PLA": "",
                "TYPE_DOC": type_doc,
                "TRANSACTION_ID": parent_id,
                "CASH_CODE": cash_code,
                "ID_TRANSH_PURP": id_transh_purp,
            };
            console.log(payload);
            axios.post(integratorURL + 'transaction', payload).then(response => {
                resp = JSON.parse(response.data)
                if (resp.result == 1) {
                    resolve(resp)
                } else {
                    reject(resp)
                }
            }).catch(err => {
                reject(err)
            })
        }).catch(err => {
            reject(err)
        })
    })
}
module.exports = Exchange