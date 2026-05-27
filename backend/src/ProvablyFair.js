const crypto = require('crypto');

class ProvablyFair {
    static generateServerSeed() {
        return crypto.randomBytes(32).toString('hex');
    }

    static hashServerSeed(seed) {
        return crypto.createHash('sha256').update(seed).digest('hex');
    }

    static generateClientSeed() {
        return crypto.randomBytes(16).toString('hex');
    }

    static calculateResult(serverSeed, clientSeed) {
        const hash = crypto.createHmac('sha256', serverSeed).update(clientSeed).digest('hex');
        // Take first 8 chars (32 bits) and convert to float 0-1
        const subHash = hash.substring(0, 8);
        const intValue = parseInt(subHash, 16);
        return intValue / 0xffffffff;
    }
}

module.exports = ProvablyFair;
