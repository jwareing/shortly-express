var express = require('express');
var urlParser = require('url');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var passport = require('passport');
var GitHubStrategy = require('passport-github2').Strategy;

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

var GITHUB_CLIENT_ID = "7bb874ce12ba40f41c69";
var GITHUB_CLIENT_SECRET = "ff70c075115e4c2e6224728f4465f00e40e55deb";


// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete GitHub profile is serialized
//   and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});


// Use the GitHubStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and GitHub
//   profile), and invoke a callback with a user object.
passport.use(new GitHubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: "http://127.0.0.1:4568/auth/github/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {
      
      // To keep the example simple, the user's GitHub profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the GitHub account with a user record in your database,
      // and return that user instead.
      return done(null, profile);
    });
  }
));

app.use(function(req,res,next){
  console.log(req.method + ' ' + req.url);
  next();
});
app.use( session({secret: 'hello'}) );

app.use(passport.initialize());
app.use(passport.session());

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));


//app.use(checkUser);
app.use(ensureAuthenticated);

app.get('/', 
function(req, res) {
  res.render('index');
});

app.get('/create', 
function(req, res) {
  res.render('index');
});

app.get('/links', 
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/links', 
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        Links.create({
          url: uri,
          title: title,
          base_url: req.headers.origin
        })
        .then(function(newLink) {
          res.send(200, newLink);
        });
      });
    }
  }).catch(function(err){console.log(err);});
});

/************************************************************/
// Write your authentication routes here
/************************************************************/
// var loggedIn = false;

app.get('/login', 
function(req, res) {
  res.render('login');
});

// app.post('/login',
// function(req, res) {
//   if(req.session.user === req.body.username){
//     res.redirect('/');
//   }else {
//     Users.fetch().then(function(){
//       var user = Users.findWhere({'username': req.body.username});
//       if(user){
//         if (user.checkPassword(req.body.password)){
//           req.session.regenerate(function(){
//             req.session.user = user.get('username');
//             res.redirect('/');
//           });
//         } else {
//           res.redirect('/login');
//         }
//       }
//       else {
//         res.redirect('/login');
//       }
//     }).catch(function(err){console.log(err)});
//   }
// });

app.get('/', ensureAuthenticated, function(req, res){
  res.render('/', { user: req.user });
});
// app.get('/signup', 
// function(req, res) {
//   res.render('signup');
// });

// app.post('/signup',
// function(req, res) {
//   Users.create({
//     username: req.body.username,
//     password: req.body.password
//   }).then(function(){
//     req.session.regenerate(function(){
//       req.session.user = req.body.username;
//       res.redirect('/');
//     });
//   });
// });

// app.get('/logout', 
// function(req, res) {
//   req.session.destroy(function(err) {
//     res.redirect('/login');
//   });
// });

// GET /auth/github
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in GitHub authentication will involve redirecting
//   the user to github.com.  After authorization, GitHub will redirect the user
//   back to this application at /auth/github/callback
app.get('/auth/github',
  passport.authenticate('github', { scope: [ 'user:email' ] }),
  function(req, res){
    // The request will be redirected to GitHub for authentication, so this
    // function will not be called.
  });

// GET /auth/github/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits')+1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);


// function checkUser(req, res, next) {
//   if (req.session.user || req.url === '/login' || req.url === '/signup'){
//     next();
//   }
//   else {
//     res.redirect('/login');
//   }
// };

function ensureAuthenticated(req, res, next) {
  console.log('authenticated: ' + req.isAuthenticated());
  var url = urlParser.parse(req.url).pathname;
  if (req.isAuthenticated() || url === '/login' || url === '/auth/github' || url === '/auth/github/callback') {  next(); }
  else{
    res.redirect('/login')
  }
};