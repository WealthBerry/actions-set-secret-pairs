const Core = require('@actions/core')
const Api = require('./src/api')
const crypto = require('crypto')

const setSecret = async (api, secret_name, secret_value) => {
  try {
    const {key_id, key} = await api.getPublicKey()
    const data = await api.createSecret(key_id, key, secret_name, secret_value)

    if (api.isOrg()) {
      data.visibility = Core.getInput('visibility')

      if (data.visibility === 'selected') {
        data.selected_repository_ids = Core.getInput('selected_repository_ids')
      }
    }

    let response = await api.setSecret(data, secret_name)
    console.error(response.status, response.data)

    if (response.status >= 400) {
      Core.setFailed(response.data)
    }
    
    return response

  } catch (e) {
    Core.setFailed(e.message)
    console.error('MyError', e)
  }     
}

const getKeyPair = async (pwd = '') => {
    return new Promise((resolve, reject) => {
        crypto.generateKeyPair('rsa', {
            modulusLength: 4096,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem',
                cipher: 'aes-256-cbc',
                passphrase: pwd
            }
        }, (err, publicKey, privateKey) => {
            if (err) return reject(err);
            resolve({publicKey, privateKey});
        });
    });
};


/**
 * Set secrets in Github repo
 * This actions is participating in #ActionsHackathon 2020
 *
 * @param {Api} api - Api instance
 * @param {string} secret_name - Secret key name
 * @param {string} secret_value - Secret raw value
 * @see https://developer.github.com/v3/actions/secrets/#create-or-update-an-organization-secret
 * @see https://dev.to/devteam/announcing-the-github-actions-hackathon-on-dev-3ljn
 * @see https://dev.to/habibmanzur/placeholder-title-5e62
 */
const boostrap = async (api, pairs) => {
  pairs = JSON.parse(pairs.replace(/\n/g, "\\n"));

  let response;
  
  // [ { "name": "TOKENIZE_MICROSERVICE", "public": "${{ secrets.TOKENIZE_MICROSERVICE_PUBLIC_KEY }}", "private": "${{ secrets.TOKENIZE_MICROSERVICE_PRIVATE_KEY }}" },
  for (let pair of pairs) {
    const publicKeyName = pair.name + "_PUBLIC_KEY";
    const publicKeyPrevName = pair.name + "_PUBLIC_KEY_PREV";
    
    const privateKeyName = pair.name + "_PRIVATE_KEY";
    const privateKeyPrevName = pair.name + "_PRIVATE_KEY_PREV";

    console.log('pair.public Base64PublicKey: ', Buffer.from(pair.public).toString('base64'));
    console.log('pair.private Base64PrivateKey: ', Buffer.from(pair.private).toString('base64'));

    //  MOVE OLD KEY TO PREV
    response = await setSecret(api, publicKeyPrevName, pair.public)
    response = await setSecret(api, privateKeyPrevName, pair.private)
    
    // SET NEW
    const {publicKey, privateKey} = await getKeyPair();

    console.log('getKeyPair Base64PublicKey: ', Buffer.from(publicKey).toString('base64'));
    console.log('getKeyPair Base64PrivateKey: ', Buffer.from(privateKey).toString('base64'));

    response = await setSecret(api, publicKeyName, publicKey)
    response = await setSecret(api, privateKeyName, privateKey)
  } // END OF FOR

  if (response.status) Core.setOutput('status', response.status)
  if (response.data) Core.setOutput('data', response.data)
  
}


try {
  // `who-to-greet` input defined in action metadata file
  let pairsOrig = Core.getInput('pairs')
  pairs = pairsOrig.replace(/\n/g, "\\n")

  if (pairsOrig !== pairs) {
      console.log('New lines escaped!')
  }

  const repository = Core.getInput('repository')
  const token = Core.getInput('token')
  const org = Core.getInput('org')

  const api = new Api(token, repository, !!org)

  boostrap(api, pairs)

} catch (error) {
  Core.setFailed(error.message)
}
