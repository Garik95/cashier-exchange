const objectClass = require('../classes/exchange');
module.exports = (mongoose) => {
    // function incr() {
    //     return new Promise((resolve, reject) => {
    //         const {
    //             Sequence
    //         } = require('../models');
    //         Sequence.incr({
    //             name: "ExchangeCheque"
    //         }).then(data => {
    //             resolve(data)
    //         }).catch(err => {
    //             reject(err)
    //         })
    //     })
    // }

    // function getPaymentType(_id) {
    //     return new Promise((resolve, reject) => {
    //         const {
    //             PaymentType
    //         } = require('../models');
    //         PaymentType.findOne({
    //             _id
    //         }).then(data => {
    //             resolve(data)
    //         }).catch(err => {
    //             reject(err)
    //         })
    //     })
    // }
    const schema = new mongoose.Schema({
        invoice: {
            type: String,
            // required: true
        },
        fromCurr: {
            type: String,
            maxLength: 3,
            minLength: 3,
            required: true
        },
        toCurr: {
            type: String,
            maxLength: 3,
            minLength: 3,
            required: true
        },
        rate: {
            type: Number,
            required: true
        },
        docNum: {
            type: String
        },
        cheque: {
            type: String
        },
        amount: {
            type: Number,
            required: true
        },
        exchangeAmount: {
            type: Number,
            required: true
        },
        // B - buy - покупка
        // S - sell - продажа
        // C - convertion - конвертация
        type: {
            type: String,
            enum: ["B", "S", "C"],
            required: true
        },
        paymentType: {
            type: mongoose.Types.ObjectId,
            // required: true
        },
        paymentTypeName: String,
        cardNumber: {
            type: String
        },
        fee: String,
        // 1 - новый
        // 3 - проведен
        status: {
            type: Number,
            enum: [1, 3],
            default: 1
        },
        createdAt: {
            type: Number,
            default: () => Date.now()
        }
    });

    schema.loadClass(objectClass);
    // schema.pre('save', async function (next) {
    //     if (!this.cheque) {
    //         this.cheque = await incr().then(data => data.value)
    //     }
    //     this.paymentTypeName = await getPaymentType(this.paymentType).then(data => data.type.value)
    //     next()
    // })
    return mongoose.model('Exchange', schema);
}