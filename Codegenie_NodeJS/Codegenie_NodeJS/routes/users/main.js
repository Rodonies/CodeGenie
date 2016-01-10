var schemas = require('../../mongoose/schemas');
var express = require('express');
var auth = require('../../passport/authlevels');
var passwordhandler = require('../../passport/passwordhandler');
var router = express.Router();

var UserModel = schemas.UserModel;

var savehandler = schemas.savehandler;

var isLoggedIn = auth.isLoggedIn;

//USER MAIN

//GET

router.get('/mine', isLoggedIn, function (req, res) {
    UserModel.findById(req.user._id, {password: 0}).lean().exec(function (err, result) {
        if (err) return console.error(err);

        res.status(200).json(result);
    })
});

//POST

router.post("/edit", isLoggedIn, function (req, res) {
    UserModel.findById(req.user._id, function (err, result) {
        if (err) return console.error(err);

        if (!passwordhandler.isValidPassword(result, req.body.oldpassword)) return res.status(400).json(["Your password isn't correct!"]);

        if (req.body.password == '') delete req.body.password;

        for (var field in req.body) result[field] = req.body[field];

        delete result._id; //prevent user from editing random/protected information, everything else is allowed.
        delete result.status;
        delete result.course;

        if (req.body.password != undefined)  //otherwise we will hash or hashed password...
            result.password = passwordhandler.createHash(result.password);

        result.registerdate = new Date();
        result.lastseen = new Date();
        delete result.__v;

        result.save(function (err) {
            savehandler(res, err, "Profile edited.");
        });
    });
});

module.exports = router;