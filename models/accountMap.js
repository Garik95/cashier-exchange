const objectClass = require('../classes/accountmap');
module.exports = (mongoose) => {
    const schema = new mongoose.Schema({
        branch: {
            type: String,
            required: true
        },
        currency: {
            type: String,
            required: true
        },
        sellAccount: {
            type: String,
            required: true
        },
        buyAccount: {
            type: String,
            required: true
        },
        sellPositionUzs: {
            type: String,
            required: true
        },
        buyPositionUzs: {
            type: String,
            required: true
        },
        buyPositionCashCode: {
            type: String,
            required: true
        },
        sellPositionCashCode: {
            type: String,
            required: true
        },
        buyCashCode: {
            type: String,
            required: true
        },
        buyNazn: {
            type: String,
            required: true
        },
        sellCashCode: {
            type: String,
            required: true
        },
        sellNazn: {
            type: String,
            required: true
        },
        uniqueStr: {
            type: String,
            unique: true
        }
    });

    // schema.loadClass(objectClass);
    schema.pre('save', function (next) {
        if (!this.uniqueStr)
            this.uniqueStr = this.branch + this.currency
        next()
    })
    return mongoose.model('accountMap', schema);
}