package org.openforis.sepal.security

import groovy.json.JsonOutput
import groovy.transform.Immutable

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

@Immutable
class GateOneAuthObject {
    private static final String HMAC_SHA1_ALGORITHM = "HmacSHA1"
    String publicKey
    String privateKey
    String username
    long timestamp

    private String sign(String data, String key) {
        SecretKeySpec signingKey = new SecretKeySpec(key.getBytes(), HMAC_SHA1_ALGORITHM)
        Mac mac = Mac.getInstance(HMAC_SHA1_ALGORITHM)
        mac.init(signingKey)
        byte[] rawHmac = mac.doFinal(data.getBytes())
        return rawHmac.encodeHex()
    }

    String toJson() {
        def data = publicKey + username + timestamp as String
        def signature = sign(data, privateKey)
        def authObject = [
                api_key: publicKey,
                upn: username,
                timestamp: timestamp,
                signature_method: 'HMAC-SHA1',
                api_version: '1.0',
                signature: signature
        ]

        JsonOutput.toJson([authObject: authObject])
    }
}