import crypto from 'crypto';
import CryptoJS from 'crypto-js';
import secp256k1 from 'secp256k1';
import NodeKey from '../../lib/nodekey/NodeKey';
import { expect } from 'chai';

describe('key exchange and symmetric encryption', () => {
  let secretKey: Buffer;

  it('alice and bob should successfully exchange shared secret key', async () => {
    const alice = crypto.createECDH('secp256k1');
    const bob = crypto.createECDH('secp256k1');

    // alice and bob create an ephemeral key pair for the key exchange
    const aliceEphemeralPubKey = alice.generateKeys();
    const bobEphemeralPubKey = bob.generateKeys();

    // they exchange their ephemeral public keys
    const aliceSecretKey = alice.computeSecret(bobEphemeralPubKey);
    const bobSecretKey = bob.computeSecret(aliceEphemeralPubKey);

    // both alice and bob should derive the same secret key
    expect(Buffer.compare(aliceSecretKey, bobSecretKey)).to.equal(0);

    secretKey = aliceSecretKey;
  });

  it('alice should encrypt messages that bob can decrypt', async () => {
    const msg = crypto.randomBytes(100);

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', secretKey, iv);
    const encrypted = Buffer.concat([iv, cipher.update(msg), cipher.final()]);

    const decipher = crypto.createDecipheriv('aes-256-cbc', secretKey, encrypted.slice(0, 16));
    const decrypted = Buffer.concat([decipher.update(encrypted.slice(16)), decipher.final()]);

    expect(msg.toString('hex')).to.be.equal(decrypted.toString('hex'));
  });
});

describe('authentication', () => {
  it('alice should sign its session init data and bob should be able to verify it', async () => {
    const aliceNodeKey = await NodeKey['generate']();
    const aliceNodePubKey = aliceNodeKey.nodePubKey;
    const aliceNodePrivKey = aliceNodeKey['privKey'];

    const alice = crypto.createECDH('secp256k1');
    const aliceEphemeralPubKey = alice.generateKeys();

    const msg = {
      nodePubKey: aliceNodePubKey,
      ephemeralPubKey: aliceEphemeralPubKey,
    };

    const msgHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(msg))
      .digest();

    // alice signs the hash of its handshake request data and send it to bob
    const { signature } = secp256k1.sign(msgHash, aliceNodePrivKey);

    // bob verifies the signature on the handshake request data hash using alice's public key
    const verified = secp256k1.verify(msgHash, signature, Buffer.from(msg.nodePubKey, 'hex'));

    expect(verified).to.be.true;
  });
});
