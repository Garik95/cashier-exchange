// const objectClass = require('../classes/exchange');
module.exports = (mongoose) => {
    const schema = new mongoose.Schema({
        exchange: {
            type: mongoose.Types.ObjectId,
            required: true
        },
        physical: Object,
        createdAt: {
            type: Date,
            default: () => Date.now()
        }
    });

    // schema.loadClass(objectClass);
    schema.pre('save', async function (next) {
        next()
    })
    return mongoose.model('physical', schema);
}